import { Address, BigInt, Bytes, log } from "@graphprotocol/graph-ts";

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
  Evidence,
  _KlerosBadgeIdToBadgeId,
  KlerosBadgeRequest,
  Badge,
  BadgeModelKlerosMetaData,
  _EvidenceGroupIDItemID,
  _ItemIDToEvidenceGroupIDToBadgeID
} from "../generated/schema";
import {
  DISPUTE_OUTCOME_NONE,
  getArbitrationParamsIndex,
  getFinalRuling,
  getTBStatus,
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

  const itemIDToEvidenceGroupID = new _ItemIDToEvidenceGroupIDToBadgeID(
    itemID.toHexString()
  );
  itemIDToEvidenceGroupID.evidenceGroupID = evidenceGroupId.toString();
  itemIDToEvidenceGroupID.save();

  const evidenceGroupIDItemID = new _EvidenceGroupIDItemID(
    evidenceGroupId.toHexString()
  );
  evidenceGroupIDItemID.itemID = itemID.toHexString();
  evidenceGroupIDItemID.save();
}

export function handleRequestChallenged(event: Dispute): void {
  const evidenceGroupID = event.params._evidenceGroupID.toHexString();
  const disputeID = event.params._disputeID.toString();
  const tcr = LightGeneralizedTCR.bind(event.address);
  // todo try to replace _EvidenceGroupIDItemID.itemID with this
  const itemID2 = tcr.arbitratorDisputeIDToItemID(
    event.params._arbitrator,
    event.params._disputeID
  );

  log.error("TCR ITEM ID FOUND: {}, GROUPID: {}, TXHASH: {}", [
    itemID2.toHexString(),
    evidenceGroupID,
    event.transaction.hash.toHexString()
  ]);

  // Look for requests related to TheBadge
  const evidenceGroupIDItemID = _EvidenceGroupIDItemID.load(evidenceGroupID);
  if (!evidenceGroupIDItemID) {
    log.warning(
      "handleRequestChallenged - not evidenceGroupIDItemID found for evidenceGroupID: {}",
      [evidenceGroupID.toString()]
    );
    return;
  }
  log.error("handleRequestChallenged - evidenceGroupFound!!: {}", [
    evidenceGroupID.toString()
  ]);

  const itemID = evidenceGroupIDItemID.itemID;

  const itemIDToEvidenceGroupIDToBadgeID = _ItemIDToEvidenceGroupIDToBadgeID.load(
    itemID
  );
  if (!itemIDToEvidenceGroupIDToBadgeID) {
    log.error(
      "handleRequestChallenged - not itemIDToEvidenceGroupIDToBadgeID found for evidenceGroupID: {} and itemID: {}",
      [evidenceGroupID.toString(), itemID.toString()]
    );
    return;
  }
  if (!itemIDToEvidenceGroupIDToBadgeID.badgeID) {
    log.warning(
      "handleRequestChallenged - not itemIDToEvidenceGroupIDToBadgeID badgeID found for evidenceGroupID: {} and itemID: {}, item not TheBadge, ignoring..",
      [evidenceGroupID.toString(), itemID.toString()]
    );
    return;
  }

  // Loads BadgeKlerosMetaData
  const badgeID = itemIDToEvidenceGroupIDToBadgeID.badgeID as string;
  const badgeKlerosMetadata = BadgeKlerosMetaData.load(badgeID);

  if (!badgeKlerosMetadata) {
    log.error(
      "handleRequestChallenged - not badgeKlerosMetadata found for with ID: {}",
      [badgeID.toString()]
    );
    return;
  }

  // Loads the Badge
  const badge = Badge.load(badgeID);

  if (!badge) {
    log.error("handleRequestChallenged - not badge found for with ID: {}", [
      badgeID.toString()
    ]);
    return;
  }

  // Puts the badge in challenged status
  badge.status = TheBadgeBadgeStatus_Challenged;
  badge.save();

  // Loads the BadgeModelKlerosMetaData
  const badgeModelKlerosMetaData = BadgeModelKlerosMetaData.load(
    badge.badgeModel
  );

  if (!badgeModelKlerosMetaData) {
    log.error(
      "handleRequestChallenged - not badgeModelKlerosMetaData found for with ID: {}",
      [badge.badgeModel.toString()]
    );
    return;
  }

  // Creates a new request
  const tcrList = Address.fromBytes(badgeModelKlerosMetaData.tcrList);
  // const requestIndex = getTCRRequestIndex(
  //   tcrList as Address,
  //   Bytes.fromHexString(itemID)
  // );
  const requestIndex = badgeKlerosMetadata.numberOfRequests.toString();
  const requestID = itemID + "-" + requestIndex.toString();
  const request = new KlerosBadgeRequest(requestID);
  request.type = "Clearing";
  request.createdAt = event.block.timestamp;
  request.badgeKlerosMetaData = badgeKlerosMetadata.id;
  request.requestIndex = BigInt.fromString(requestIndex);
  request.arbitrationParamsIndex = getArbitrationParamsIndex(tcrList);
  request.numberOfEvidences = BigInt.fromI32(1);
  request.disputed = true;
  request.disputeID = BigInt.fromString(disputeID);
  request.challenger = event.transaction.from;
  request.disputeOutcome = DISPUTE_OUTCOME_NONE;
  request.resolved = false;
  request.resolutionTime = BigInt.fromI32(0);
  request.arbitrator = tcr.arbitrator();
  request.save();

  // const klerosController = KlerosController.bind(tcrList);
  // request.requester = klerosController
  //   .klerosBadge(BigInt.fromString(badge.id))
  //   .getCallee();
  // todo review
  request.requester = event.transaction.from;
  request.save();

  badgeKlerosMetadata.numberOfRequests = badgeKlerosMetadata.numberOfRequests.plus(
    BigInt.fromI32(1)
  );
  badgeKlerosMetadata.save();
  // todo in handleEvidence we need to load this request and add the evidence to it
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
    log.warning("handleItemStatusChange - Item not found for ID: {}", [
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

  if (!badge.badgeKlerosMetaData) {
    log.warning(
      "handleItemStatusChange - Badge: {} does not have BadgeKlerosMetadata!",
      [klerosBadgeIdToBadgeId.badgeId]
    );
    return;
  }

  // Loads the BadgeKlerosMetaData
  const badgeKlerosMetadata = BadgeKlerosMetaData.load(
    badge.badgeKlerosMetaData as string
  );

  if (!badgeKlerosMetadata) {
    log.error(
      "handleStatusUpdated - not badgeKlerosMetadata found for with ID: {}",
      [badge.id]
    );
    return;
  }

  // Updates the badge status
  badge.status = getTBStatus(itemInfo.value0);
  badge.save();

  const requestIndex = badgeKlerosMetadata.numberOfRequests.minus(
    BigInt.fromI32(1)
  );
  const requestID =
    event.params._itemID.toHexString() + "-" + requestIndex.toString();
  const request = KlerosBadgeRequest.load(requestID);
  if (!request) {
    log.error("handleStatusUpdated - Request: {} not found.", [requestID]);
    return;
  }
  const requestInfo = tcr.getRequestInfo(itemID, requestIndex);
  request.resolved = true;
  request.resolutionTime = event.block.timestamp;
  request.resolutionTx = event.transaction.hash;
  request.disputeOutcome = getFinalRuling(requestInfo.getRuling());
  request.save();
}

export function handleEvidence(event: EvidenceEvent): void {
  const evidenceGroupID = event.params._evidenceGroupID;
  const evidenceParam = event.params._evidence;

  // Loads the request related
  const evidenceGroupIDItemID = _EvidenceGroupIDItemID.load(
    evidenceGroupID.toHexString()
  );
  if (!evidenceGroupIDItemID) {
    log.warning(
      "handleEvidence - not evidenceGroupIDItemID found for evidenceGroupID: {}",
      [evidenceGroupID.toString()]
    );
    return;
  }

  const itemID = evidenceGroupIDItemID.itemID;
  const requestID = itemID + "-" + "3";
  const request = KlerosBadgeRequest.load(requestID);
  if (!request) {
    log.error("handleEvidence - Request {} not found.", [requestID]);
    return;
  }

  request.numberOfEvidences = request.numberOfEvidences.plus(BigInt.fromI32(1));

  // Creates the evidence and relates it with the request
  const evidence = new Evidence(
    requestID + "-" + request.numberOfEvidences.toString()
  );
  evidence.uri = evidenceParam;
  evidence.timestamp = event.block.timestamp;
  evidence.request = request.id;
  evidence.sender = event.transaction.from;

  evidence.save();
  request.save();
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
