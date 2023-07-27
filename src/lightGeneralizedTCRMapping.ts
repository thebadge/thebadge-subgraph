import { BigInt, Bytes, log } from "@graphprotocol/graph-ts";

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
  _EvidenceGroupIDToRequestIDToItemID,
  Evidence,
  _KlerosBadgeIdToBadgeId,
  KlerosBadgeRequest,
  Badge,
  LRequest
} from "../generated/schema";
import {
  getFinalRuling,
  getTBStatus,
  getTCRRequestIndex,
  TheBadgeBadgeStatus_Challenged
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
  const itemID = event.params._itemID;
  const evidenceGroupId = event.params._evidenceGroupID;

  const graphItemID =
    event.params._itemID.toHexString() + "@" + event.address.toHexString();

  const tcr = LightGeneralizedTCR.bind(event.address);
  const requestIndex = getTCRRequestIndex(tcr._address, itemID);
  const requestID = itemID.toHexString() + "-" + requestIndex.toString();

  const request = new LRequest(requestID);
  request.disputed = false;
  request.challenger = Bytes.fromHexString("0x");
  request.requester = event.transaction.from;
  request.numberOfEvidences = BigInt.fromI32(0);
  request.resolved = false;
  request.disputeID = BigInt.fromI32(0);
  request.submissionTime = event.block.timestamp;

  const evidenceGroupIDToLRequest = new _EvidenceGroupIDToRequestIDToItemID(
    evidenceGroupId.toString()
  );

  evidenceGroupIDToLRequest.request = requestID;
  evidenceGroupIDToLRequest.requestIndex =
    graphItemID + "-" + requestIndex.toString();
  evidenceGroupIDToLRequest.itemID = itemID.toHexString();
  evidenceGroupIDToLRequest.save();
  request.save();
}

export function handleRequestChallenged(event: Dispute): void {
  const evidenceGroupID = event.params._evidenceGroupID.toString();
  const evidence = _EvidenceGroupIDToRequestIDToItemID.load(evidenceGroupID);

  if (!evidence) {
    log.error("handleRequestChallenged - Evidence not found for id {}", [
      evidenceGroupID
    ]);
    return;
  }

  const genericRequest = LRequest.load(evidence.request.toString());
  if (!genericRequest) {
    log.error("handleRequestChallenged - Request {} not found.", [
      evidence.request.toString()
    ]);
    return;
  }
  genericRequest.challenger = event.transaction.from;
  genericRequest.disputeID = event.params._disputeID;
  genericRequest.disputed = true;
  genericRequest.save();

  const klerosRequest = KlerosBadgeRequest.load(evidence.request);
  if (klerosRequest) {
    klerosRequest.challenger = genericRequest.challenger;
    klerosRequest.disputeID = genericRequest.disputeID;
    klerosRequest.disputed = genericRequest.disputed;
    klerosRequest.save();
  }

  const klerosBadgeIdToBadgeId = _KlerosBadgeIdToBadgeId.load(evidence.itemID);
  if (!klerosBadgeIdToBadgeId) {
    log.error("handleRequestChallenged - Item not found for ID: {}", [
      evidence.itemID
    ]);
    return;
  }

  const badge = Badge.load(klerosBadgeIdToBadgeId.badgeId);
  if (!badge) {
    log.error("handleRequestChallenged - Badge not found for ID: {}", [
      klerosBadgeIdToBadgeId.badgeId
    ]);
    return;
  }
  badge.status = TheBadgeBadgeStatus_Challenged;
  badge.save();
}

export function handleStatusUpdated(event: ItemStatusChange): void {
  const tcr = LightGeneralizedTCR.bind(event.address);
  const itemID = event.params._itemID;
  const itemInfo = tcr.getItemInfo(itemID);

  // If the itemID does not match with one of ours badges, its not an itemID of TheBadge but Kleros instead
  // We just ignore it
  const klerosBadgeIdToBadgeId = _KlerosBadgeIdToBadgeId.load(
    itemID.toHexString()
  );
  if (!klerosBadgeIdToBadgeId) {
    log.error("handleItemStatusChange - Item not found for ID: {}", [
      itemID.toHexString()
    ]);
    return;
  }

  const badge = Badge.load(klerosBadgeIdToBadgeId.badgeId);
  if (!badge) {
    log.error("handleItemStatusChange - Badge not found for ID: {}", [
      klerosBadgeIdToBadgeId.badgeId
    ]);
    return;
  }

  // Updates the badge status
  badge.status = getTBStatus(itemInfo.value0);
  badge.save();

  // Updates the requests status
  const requestIndex = BigInt.fromI32(0);
  const requestInfo = tcr.getRequestInfo(itemID, requestIndex);
  const kbRequestID =
    event.params._itemID.toHexString() + "-" + requestIndex.toString();
  const genericRequest = LRequest.load(kbRequestID);
  if (!genericRequest) {
    log.error("handleStatusUpdated - Request: {} not found.", [kbRequestID]);
    return;
  }
  genericRequest.resolved = true;
  genericRequest.resolutionTime = event.block.timestamp;
  genericRequest.resolutionTx = event.transaction.hash;
  genericRequest.disputeOutcome = getFinalRuling(requestInfo.value6);
  genericRequest.save();

  const klerosBadgeRequest = KlerosBadgeRequest.load(kbRequestID);
  if (!klerosBadgeRequest) {
    log.error("handleStatusUpdated - klerosBadgeRequest: {} not found.", [
      kbRequestID
    ]);
    return;
  }

  // todo directly asign id klerosBadgeRequest = request
  klerosBadgeRequest.resolved = genericRequest.resolved;
  klerosBadgeRequest.resolutionTime = genericRequest.resolutionTime;
  klerosBadgeRequest.resolutionTx = genericRequest.resolutionTx;
  klerosBadgeRequest.disputeOutcome = genericRequest.disputeOutcome;
  klerosBadgeRequest.save();
}

export function handleEvidence(event: EvidenceEvent): void {
  const evidenceGroupIDToRequestID = _EvidenceGroupIDToRequestIDToItemID.load(
    event.params._evidenceGroupID.toString()
  );
  if (!evidenceGroupIDToRequestID) {
    log.error("handleEvidence - EvidenceGroupID {} not registered for {}.", [
      event.params._evidenceGroupID.toString(),
      event.address.toHexString()
    ]);
    return;
  }

  const genericRequest = LRequest.load(evidenceGroupIDToRequestID.request);
  if (!genericRequest) {
    log.error("handleEvidence - Request {} not found.", [
      evidenceGroupIDToRequestID.request
    ]);
    return;
  }

  const evidenceID =
    genericRequest.id + "-" + genericRequest.numberOfEvidences.toString();
  const evidence = new Evidence(evidenceID);
  evidence.uri = event.params._evidence;
  evidence.sender = event.transaction.from;
  evidence.timestamp = event.block.timestamp;
  evidence.request = genericRequest.id;
  genericRequest.numberOfEvidences = genericRequest.numberOfEvidences.plus(
    BigInt.fromI32(1)
  );
  genericRequest.save();
  evidence.save();
}

export function handleRuling(event: Ruling): void {
  const tcr = LightGeneralizedTCR.bind(event.address);
  const itemID = tcr.arbitratorDisputeIDToItemID(
    event.address,
    event.params._disputeID
  );

  const klerosBadgeIdToBadgeId = _KlerosBadgeIdToBadgeId.load(
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

  const requestID = badgeKlerosMetadata.id + "-" + "0";
  const genericRequest = KlerosBadgeRequest.load(requestID);

  if (!genericRequest) {
    log.error("handleRuling - Request {} not found.", [requestID]);
    return;
  }

  genericRequest.resolutionTime = event.block.timestamp;
  genericRequest.save();
}
