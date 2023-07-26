import { Address, BigInt, log } from "@graphprotocol/graph-ts";

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
  BadgeModelKlerosMetaData
} from "../generated/schema";
import {
  DISPUTE_OUTCOME_NONE,
  getArbitrationParamsIndex,
  getFinalRuling,
  getTBStatus,
  getTCRRequestIndex, getTCRRequestInfo,
  TheBadgeBadgeStatus_Challenged
} from "./utils";
import { KlerosController } from "../generated/KlerosController/KlerosController";
import { TheBadge } from "../generated/TheBadge/TheBadge";

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
  //const requestID = itemID.toHexString() + "-" + "0";
  // The index of this request will be taken from the array of requests of the given item
  // It will always be the length of the requests array - 1

  //  const requestID = itemID.toHexString() + "-" + requestIndex.toString();

  log.error('handleRequestSubmitted - init: {}', [itemID.toHexString()])
  const klerosBadgeIdToBadgeId = _KlerosBadgeIdToBadgeId.load(
    itemID.toString()
  );
  if (!klerosBadgeIdToBadgeId) {
    log.error("handleRequestSubmitted - Item not found for ID: {}", [
      itemID.toHexString()
    ]);
    return;
  }
  const badgeId = klerosBadgeIdToBadgeId.badgeId;
  const badgeIdBigInt = BigInt.fromString(badgeId);
  const badgeKlerosMetadata = BadgeKlerosMetaData.load(badgeId);
  if (!badgeKlerosMetadata) {
    log.error(
      "handleRequestSubmitted - badgeKlerosMetadata not found for id {}",
      [badgeId]
    );
    return;
  }
  const badge = Badge.load(badgeId);
  if (!badge) {
    log.error("handleRequestSubmitted - Badge not found for ID: {}", [badgeId]);
    return;
  }

  log.error("handleRequestSubmitted - Badge FOUND ID: {}", [badgeId]);
  const klerosController = KlerosController.bind(event.address);
  const theBadge = TheBadge.bind(klerosController.theBadge());
  const badgeModelId = theBadge
    .badge(badgeIdBigInt)
    .getBadgeModelId()
    .toString();

  const _badgeModelKlerosMetaData = BadgeModelKlerosMetaData.load(badgeModelId);
  log.error("handleRequestSubmitted - Badge Model ID: {}", [badgeModelId]);
  if (!_badgeModelKlerosMetaData) {
    log.error(
      "handleRequestSubmitted - BadgeModel not found. badgeId {} badgeModelId {}",
      [badgeId.toString(), badgeModelId]
    );
    return;
  }

  log.error("handleRequestSubmitted - Badge Model FOUND ID: {}", [badgeModelId]);
  // Creates an historic request and saves it into the BadgeKlerosMetaData
  const tcrListAddress = Address.fromBytes(_badgeModelKlerosMetaData.tcrList);
  const requestIndex = getTCRRequestIndex(tcrListAddress, itemID);
  const requestID = itemID.toHexString() + "-" + requestIndex.toString();
  const requestInfo = getTCRRequestInfo(tcrListAddress, itemID, BigInt.fromString(requestID))
  const request = new KlerosBadgeRequest(requestID);
  // todo get the badge data from the contract
  // TODO update the type
  request.type = "Registration";
  request.createdAt = event.block.timestamp;
  request.badgeKlerosMetaData = badgeKlerosMetadata.id;
  request.requestIndex = requestIndex;
  request.arbitrationParamsIndex = getArbitrationParamsIndex(tcrListAddress);
  request.requester = klerosController.klerosBadge(badgeIdBigInt).getCallee();
  request.numberOfEvidences = BigInt.fromI32(1);
  request.disputed = requestInfo.getDisputed();
  request.disputeOutcome = getFinalRuling(requestInfo.getRuling());
  request.resolved = requestInfo.getResolved();
  if(requestInfo.getResolved()) {
    request.resolutionTime = event.block.timestamp;
  } else {
    request.resolutionTime = BigInt.fromI32(0);
  }
  request.save();

  const auxHistoricalRequests = badgeKlerosMetadata.historicalRequests
  auxHistoricalRequests.push(request.id)
  badgeKlerosMetadata.historicalRequests = auxHistoricalRequests
  badgeKlerosMetadata.save()

  // Creates the mapper of evidenceGroupId <=> klerosBadgeRequest
  // Note that this even runs before mintKlerosBadge() so we are storing here request ids
  // That belongs to our badges but also ids that belongs to kleros, this mean that on the mintKlerosBadge() event (which occurs after), ids that are not TB ids, should be removed
  const evidenceGroupIDToLRequest = new _EvidenceGroupIDToRequestIDToItemID(
    event.params._evidenceGroupID.toString()
  );
  evidenceGroupIDToLRequest.itemID = itemID.toHexString();
  evidenceGroupIDToLRequest.request = requestID;
  evidenceGroupIDToLRequest.save();

  // Updates the badgeStatus in case that it was a removeItem() o addItem() request
  // In case of addItemDirectly() or removeItemDirectly() the status will be updated in the ItemStatusChange() event
  const tcr = LightGeneralizedTCR.bind(event.address);
  const itemInfo = tcr.getItemInfo(itemID);
  badge.status = getTBStatus(itemInfo.value0);
  badge.save();
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

  const genericRequest = KlerosBadgeRequest.load(evidence.request.toString());
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
  log.error("handleItemStatusChange - TCR: {}", [
    event.params._itemID.toHexString()
  ]);
  const tcr = LightGeneralizedTCR.bind(event.address);
  const itemID = event.params._itemID;
  const item = tcr.items(itemID);
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
  log.error(
    "handleItemStatusChange - Item found for ID: {}, badgeID: {}, status: {}",
    [
      itemID.toHexString(),
      klerosBadgeIdToBadgeId.badgeId,
      itemInfo.value0.toString()
    ]
  );
  const badge = Badge.load(klerosBadgeIdToBadgeId.badgeId);
  if (!badge) {
    log.error("handleItemStatusChange - Badge not found for ID: {}", [
      klerosBadgeIdToBadgeId.badgeId
    ]);
    return;
  }

  log.error("handleItemStatusChange - Item status for ID: {}", [
    item.getStatus().toString()
  ]);
  // Updates the badge status
  badge.status = getTBStatus(itemInfo.value0);
  badge.save();

  // Updates the requests status
  const requestIndex = BigInt.fromI32(0);
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

  const genericRequest = KlerosBadgeRequest.load(
    evidenceGroupIDToRequestID.request
  );
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
