import { BigInt, log } from "@graphprotocol/graph-ts";

import {
  Dispute,
  LightGeneralizedTCR,
  ItemStatusChange,
  RequestSubmitted,
  Evidence as EvidenceEvent,
  Ruling
} from "../generated/templates/LightGeneralizedTCR/LightGeneralizedTCR";
import {
  BadgeKlerosMetaData,
  EvidenceGroupIDToRequestIDToItemID,
  Evidence,
  KlerosBadgeIdToBadgeId, KlerosBadgeRequest
} from "../generated/schema";
import {
  CLEARING_REQUESTED_CODE,
  getFinalRuling,
  REGISTRATION_REQUESTED_CODE,
} from "./utils";

// Items on a TCR can be in 1 of 4 states:
// - (0) Absent: The item is not registered on the TCR and there are no pending requests.
// - (1) Registered: The item is registered and there are no pending requests.
// - (2) Registration Requested: The item is not registered on the TCR, but there is a pending
//       registration request.
// - (3) Clearing Requested: The item is registered on the TCR, but there is a pending removal
//       request. These are sometimes also called removal requests.
//
// Registration and removal requests can be challenged. Once the request resolves (either by
// passing the challenge period or via dispute resolution), the item state is updated to 0 or 1.
// Note that in this mapping, we also use extended status, which just map the combination
// of the item status and disputed status.
//
// A variable naming convention regarding arrays and entities:
// Index: This is the position of the in-contract array.
// ID: This is the entity id.
//
// Example:
// requestIndex: 0
// requestID: <itemID>@<tcrAddress>-0
//
// The only exception to this rule is the itemID, which is the in-contract itemID.
//
// TIP: Before reading an event handler for the very first time, we recommend
// looking at where that event is emitted in the contract. Remember that
// the order in which events are emitted define the order in which
// handlers are run.

export function handleRequestSubmitted(event: RequestSubmitted): void {
  const itemID = event.params._itemID.toHexString();
  const requestID = itemID + "-" + "0";

  // Creates the mapper of evidenceGroupId <=> klerosBadgeRequest
  // Note that this even runs before mintKlerosBadge() so we are storing here request ids
  // That belongs to our badges but also ids that belongs to kleros, this mean that on the mintKlerosBadge() event (which occurs after), ids that are not TB ids, should be removed
  const evidenceGroupIDToLRequest = new EvidenceGroupIDToRequestIDToItemID(
    event.params._evidenceGroupID.toString()
  );
  evidenceGroupIDToLRequest.itemID = itemID;
  evidenceGroupIDToLRequest.request = requestID;
  evidenceGroupIDToLRequest.save();
}

export function handleRequestChallenged(event: Dispute): void {
  const evidenceGroupID = event.params._evidenceGroupID.toString();
  const evidence = EvidenceGroupIDToRequestIDToItemID.load(evidenceGroupID);

  if (!evidence) {
    log.error("handleRequestSubmitted - Evidence not found for id {}", [
      evidenceGroupID
    ]);
    return;
  }

  const genericRequest = KlerosBadgeRequest.load(evidence.request.toString());

  if (!genericRequest) {
    log.error("handleRequestSubmitted - Request {} not found.", [
      evidence.request.toString()
    ]);
    return;
  }

  genericRequest.challenger = event.transaction.from;
  genericRequest.disputeID = event.params._disputeID;
  genericRequest.disputed = true;
  genericRequest.save();
}

export function handleStatusUpdated(event: ItemStatusChange): void {
  // This handler is used to handle transations to item statuses 0 and 1.
  // All other status updates are handled elsewhere.
  const tcr = LightGeneralizedTCR.bind(event.address);
  const itemID = event.params._itemID;
  const itemInfo = tcr.getItemInfo(itemID);
  if (
    itemInfo.value0 == REGISTRATION_REQUESTED_CODE ||
    itemInfo.value0 == CLEARING_REQUESTED_CODE
  ) {
    // LRequest not yet resolved. No-op as changes are handled
    // elsewhere.
    return;
  }

  const klerosBadgeIdToBadgeId = KlerosBadgeIdToBadgeId.load(
    itemID.toHexString()
  );

  if (!klerosBadgeIdToBadgeId) {
    log.error(
      "handleStatusUpdated - klerosBadgeIdToBadgeId not found for id {}",
      [itemID.toHexString()]
    );
    return;
  }

  const badgeKlerosMetadata = BadgeKlerosMetaData.load(
    klerosBadgeIdToBadgeId.badgeId
  );

  if (!badgeKlerosMetadata) {
    log.error("handleStatusUpdated - badgeKlerosMetadata not found for id {}", [
      klerosBadgeIdToBadgeId.badgeId
    ]);
    return;
  }

  const requestIndex = badgeKlerosMetadata.numberOfRequests.minus(
    BigInt.fromI32(1)
  );
  const requestInfo = tcr.getRequestInfo(itemID, requestIndex);
  const kbRequestID =
    event.params._itemID.toHexString() + "-" + requestIndex.toString();
  const genericRequest = KlerosBadgeRequest.load(kbRequestID);

  if (!genericRequest) {
    log.error("handleStatusUpdated - Request: {} not found.", [kbRequestID]);
    return;
  }

  genericRequest.resolved = true;
  genericRequest.resolutionTime = event.block.timestamp;
  genericRequest.resolutionTx = event.transaction.hash;
  genericRequest.disputeOutcome = getFinalRuling(requestInfo.value6);
  genericRequest.save();
}

export function handleEvidence(event: EvidenceEvent): void {
  const evidenceGroupIDToRequestID = EvidenceGroupIDToRequestIDToItemID.load(
    event.params._evidenceGroupID.toString()
  );
  if (!evidenceGroupIDToRequestID) {
    log.error("handleEvidence - EvidenceGroupID {} not registered for {}.", [
      event.params._evidenceGroupID.toString(),
      event.address.toHexString()
    ]);
    return;
  }

  const genericRequest = KlerosBadgeRequest.load(evidenceGroupIDToRequestID.request);
  if (!genericRequest) {
    log.error("handleEvidence - Request {} not found.", [
      evidenceGroupIDToRequestID.request
    ]);
    return;
  }

  const evidence = new Evidence(
    genericRequest.id + "-" + genericRequest.numberOfEvidences.toString()
  );
  evidence.uri = event.params._evidence;
  evidence.sender = event.transaction.from;
  evidence.timestamp = event.block.timestamp;
  evidence.save();

  let auxEvidences = genericRequest.evidences;
  if (!auxEvidences) {
    auxEvidences = [];
  }
  auxEvidences.push(genericRequest.id);
  genericRequest.evidences = auxEvidences;
  genericRequest.numberOfEvidences = genericRequest.numberOfEvidences.plus(
    BigInt.fromI32(1)
  );
  genericRequest.save();
}

export function handleRuling(event: Ruling): void {
  const tcr = LightGeneralizedTCR.bind(event.address);
  const itemID = tcr.arbitratorDisputeIDToItemID(
    event.address,
    event.params._disputeID
  );

  const klerosBadgeIdToBadgeId = KlerosBadgeIdToBadgeId.load(
    itemID.toHexString()
  );

  if (!klerosBadgeIdToBadgeId) {
    log.error("handleRuling - klerosBadgeIdToBadgeId not found for id {}", [
      itemID.toHexString()
    ]);
    return;
  }

  const badgeKlerosMetadata = BadgeKlerosMetaData.load(
    klerosBadgeIdToBadgeId.badgeId
  );

  if (!badgeKlerosMetadata) {
    log.error("handleRuling - badgeKlerosMetadata not found for id {}", [
      klerosBadgeIdToBadgeId.badgeId
    ]);
    return;
  }

  const requestID =
    badgeKlerosMetadata.id +
    "-" +
    badgeKlerosMetadata.numberOfRequests.minus(BigInt.fromI32(1)).toString();

  const genericRequest = KlerosBadgeRequest.load(requestID);

  if (!genericRequest) {
    log.error("handleRuling - Request {} not found.", [requestID]);
    return;
  }

  genericRequest.resolutionTime = event.block.timestamp;
  genericRequest.save();
}
