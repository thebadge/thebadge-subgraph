import { Address, BigInt, Bytes, log } from "@graphprotocol/graph-ts";

import {
  Dispute,
  LightGeneralizedTCR,
  ItemStatusChange,
  RequestSubmitted,
  Evidence as EvidenceEvent,
  Ruling
} from "../../generated/templates/LightGeneralizedTCR/LightGeneralizedTCR";
import {
  Evidence,
  KlerosBadgeRequest,
  Badge,
  BadgeModelKlerosMetaData,
  _EvidenceGroupIDItemID,
  _ItemIDToEvidenceGroupIDToBadgeID,
  BadgeKlerosMetaData,
  _KlerosBadgeIdToBadgeId,
  ProtocolStatistic,

  BadgeModel
} from "../../generated/schema";
import {

  getFinalRuling,
  getTBStatus,
  loadUserCuratorStatisticsOrGetDefault,
  loadUserOrGetDefault,
  loadUserStatisticsOrGetDefault,
  TCRItemStatusCode_CLEARING_REQUESTED_CODE,
  TheBadgeBadgeStatus_Challenged,
  updateUsersChallengesStatistics
} from "../utils";
import { TheBadgeModels } from "../../generated/TheBadgeModels/TheBadgeModels";
import { TheBadgeStore } from "../../generated/TheBadge/TheBadgeStore";
import { KlerosBadgeRequestBuilder } from "../utils/builders/KlerosBadgeRequestBuilder";

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
  const evidenceGroupId = event.params._evidenceGroupID.toHexString();

  const evidenceGroupCreated = _EvidenceGroupIDItemID.load(evidenceGroupId);
  if (!evidenceGroupCreated) {
    const evidenceGroupIDItemID = new _EvidenceGroupIDItemID(evidenceGroupId);
    evidenceGroupIDItemID.itemID = itemID;
    evidenceGroupIDItemID.save();
  }

  const badgeCreatedFound = _ItemIDToEvidenceGroupIDToBadgeID.load(itemID);
  if (!badgeCreatedFound) {
    const itemIDToEvidenceGroupID = new _ItemIDToEvidenceGroupIDToBadgeID(
      itemID
    );
    itemIDToEvidenceGroupID.evidenceGroupID = evidenceGroupId;
    itemIDToEvidenceGroupID.save();
    return;
  }

  // Loads the Badge
  const badgeID = badgeCreatedFound.badgeID as string;
  const badge = Badge.load(badgeID);

  if (!badge) {
    log.error("handleRequestSubmitted - not badge found for with ID: {}", [
      badgeID.toString()
    ]);
    return;
  }

  // If it's not a registration request, creates a remove request and assigns it to the list of requests
  // Checks the status of the item
  const tcr = LightGeneralizedTCR.bind(event.address);
  const itemInfo = tcr.getItemInfo(event.params._itemID);
  const status = itemInfo.getStatus();

  if (status !== TCRItemStatusCode_CLEARING_REQUESTED_CODE) {
    log.warning(
      "handleRequestSubmitted - The item: {} is not in CLEARING status, no request has been assigned. Item status: {}",
      [itemID, status.toString()]
    );
    return;
  }

  // Loads the BadgeModelKlerosMetaData
  const badgeModelKlerosMetaData = BadgeModelKlerosMetaData.load(
    badge.badgeModel
  );

  if (!badgeModelKlerosMetaData) {
    log.error(
      "handleRequestSubmitted - not badgeModelKlerosMetaData found for with ID: {}",
      [badge.badgeModel.toString()]
    );
    return;
  }

  const badgeKlerosMetadata = BadgeKlerosMetaData.load(badgeID);

  if (!badgeKlerosMetadata) {
    log.error(
      `handleRequestSubmitted - not badgeKlerosMetadata found for with ID: {}`,
      [badgeID.toString()]
    );
    return;
  }

  // Creates a new request
  const tcrList = Address.fromBytes(badgeModelKlerosMetaData.tcrList);
  const requestIndex = badgeKlerosMetadata.numberOfRequests.toString();
  const requestID = itemID + "-" + requestIndex.toString();

  const request = new KlerosBadgeRequestBuilder({
    requestID,
    type: "Clearing",
    createdAt: event.block.timestamp,
    badgeKlerosMetadata: badgeKlerosMetadata.id,
    requestIndex: BigInt.fromString(requestIndex),
    tcrListAddress: tcrList,
    requesterAddress: event.transaction.from,
    arbitrator: tcr.arbitrator()
  }).build();

  request.save();

  badgeKlerosMetadata.numberOfRequests = badgeKlerosMetadata.numberOfRequests.plus(
    BigInt.fromI32(1)
  );
  badgeKlerosMetadata.save();

  // Finally updates the badgeStatus
  badge.status = getTBStatus(status);
  badge.save();
}

export function handleRequestChallenged(event: Dispute): void {
  const evidenceGroupID = event.params._evidenceGroupID.toHexString();
  const disputeID = event.params._disputeID;

  // Loads BadgeKlerosMetaData
  // Loads the request related
  const evidenceGroupIDItemID = _EvidenceGroupIDItemID.load(evidenceGroupID);
  if (!evidenceGroupIDItemID) {
    log.warning(
      `handleRequestChallenged - not evidenceGroupIDItemID found for evidenceGroupID: {}`,
      [evidenceGroupID.toString()]
    );
    return;
  }

  const itemID = evidenceGroupIDItemID.itemID;
  const itemIDToEvidenceGroupIDToBadgeID = _ItemIDToEvidenceGroupIDToBadgeID.load(
    itemID
  );
  if (!itemIDToEvidenceGroupIDToBadgeID) {
    log.error(
      `handleRequestChallenged - not itemIDToEvidenceGroupIDToBadgeID found for evidenceGroupID: {} and itemID: {}`,
      [evidenceGroupID.toString(), itemID.toString()]
    );
    return;
  }
  if (!itemIDToEvidenceGroupIDToBadgeID.badgeID) {
    log.warning(
      `handleRequestChallenged - not itemIDToEvidenceGroupIDToBadgeID badgeID found for evidenceGroupID: {} and itemID: {}, item not TheBadge, ignoring..`,
      [evidenceGroupID.toString(), itemID.toString()]
    );
    return;
  }

  // Loads the Badge
  const badgeID = itemIDToEvidenceGroupIDToBadgeID.badgeID as string;
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

  const badgeKlerosMetadata = BadgeKlerosMetaData.load(badge.id);
  if (!badgeKlerosMetadata) {
    log.error(
      `handleRequestChallenged - badgeKlerosMetadata not found for id {}`,
      [badge.id]
    );
    return;
  }

  // Creates a new request
  const requestIndex = badgeKlerosMetadata.numberOfRequests.minus(
    BigInt.fromI32(1)
  );
  const requestID = itemID + "-" + requestIndex.toString();
  const request = KlerosBadgeRequest.load(requestID);

  if (!request) {
    log.error("handleRequestChallenged - Request: {} not found.", [requestID]);
    return;
  }

  // Adds the disputeID to the request
  request.challenger = event.transaction.from;
  request.disputeID = disputeID;
  request.disputed = true;
  request.save();

  // Marks the user as curator
  const userAddress = event.transaction.from.toHexString();
  const user = loadUserOrGetDefault(userAddress);
  user.save();

  if (!user) {
    log.error(`handleRequestChallenged - user with address: {} not found`, [
      userAddress
    ]);
    return;
  }

  if (!user.isCurator) {
    user.isCurator = true;
    user.save();
  }

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

  const badgeModel = BadgeModel.load(badgeModelKlerosMetaData.badgeModel);
  if (!badgeModel) {
    log.error(
      "handleRequestChallenged - not badgeModel found for with ID: {}",
      [badgeModelKlerosMetaData.badgeModel]
    );
    return;
  }

  const theBadgeModels = TheBadgeModels.bind(
    Address.fromBytes(badgeModel.contractAddress)
  );
  const theBadgeStore = TheBadgeStore.bind(theBadgeModels._badgeStore());
  const theBadgeContractAddress = theBadgeStore.allowedContractAddressesByContractName(
    "TheBadge"
  );

  // Updates the protocol statistics
  const statistic = ProtocolStatistic.load(
    theBadgeContractAddress.toHexString()
  );
  if (!statistic) {
    log.error(
      `handleRequestChallenged - statistic with address: {} not found`,
      [theBadgeContractAddress.toHexString()]
    );
    return;
  }

  statistic.badgesChallengedAmount = statistic.badgesChallengedAmount.plus(
    BigInt.fromI32(1)
  );

  // New curator registered
  if (!statistic.badgeCurators.includes(Bytes.fromHexString(userAddress))) {
    statistic.badgeCuratorsAmount = statistic.badgeCuratorsAmount.plus(
      BigInt.fromI32(1)
    );
    const auxCurators = statistic.badgeCurators;
    auxCurators.push(Bytes.fromHexString(user.id));
    statistic.badgeCurators = auxCurators;
  }

  statistic.save();

  // Updates the curator statistics
  const curatorStatistics = loadUserCuratorStatisticsOrGetDefault(user.id);
  curatorStatistics.challengesMadeAmount = curatorStatistics.challengesMadeAmount.plus(
    BigInt.fromI32(1)
  );
  curatorStatistics.save();

  // Updates user statistics
  const userStatistics = loadUserStatisticsOrGetDefault(badge.account);
  userStatistics.challengesReceivedAmount = userStatistics.challengesReceivedAmount.plus(
    BigInt.fromI32(1)
  );
  userStatistics.timeOfLastChallengeReceived = event.block.timestamp;
  userStatistics.save();
}

export function handleStatusUpdated(event: ItemStatusChange): void {
  const tcr = LightGeneralizedTCR.bind(event.address);
  const itemID = event.params._itemID;
  const itemInfo = tcr.getItemInfo(itemID);
  // If false, its a requests coming from either executeRequest or rule
  // If true it has been added or removed using addItemDirectly or removeItemDirectly
  const updatedDirectly = event.params._updatedDirectly;

  // If the itemID does not match with one of ours badges, its not an itemID of TheBadge but Kleros instead
  // We just ignore it
  const klerosBadgeIdToBadgeId = _KlerosBadgeIdToBadgeId.load(
    itemID.toHexString()
  );
  if (!klerosBadgeIdToBadgeId) {
    if (!updatedDirectly) {
      log.error(
        `handleStatusUpdated - klerosBadgeIdToBadgeId not found for id {}`,
        [itemID.toHexString()]
      );
    }
    return;
  }

  const badgeKlerosMetadata = BadgeKlerosMetaData.load(
    klerosBadgeIdToBadgeId.badgeId
  );

  if (!badgeKlerosMetadata) {
    log.error(`handleStatusUpdated - badgeKlerosMetadata not found for id {}`, [
      klerosBadgeIdToBadgeId.badgeId
    ]);
    return;
  }

  const badge = Badge.load(badgeKlerosMetadata.badge);
  if (!badge) {
    log.error("handleStatusUpdated - Badge not found for ID: {}", [
      badgeKlerosMetadata.badge
    ]);
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
  const ruling = requestInfo.getRuling();
  request.resolved = true;
  request.resolutionTime = event.block.timestamp;
  request.resolutionTx = event.transaction.hash;
  request.disputeOutcome = getFinalRuling(ruling);
  request.save();

  // Updates statistics
  let challengerAddress: string | null = null;
  if (request.challenger) {
    challengerAddress = (request.challenger as Bytes).toHexString();
  }
  // Only takes into account the requests that are coming either from executeRequest or rule
  // If it was added or removed directly, that means that the request is still open
  // If the request has no disputeID, that means that's not a dispute open
  if (!updatedDirectly && request.disputeID) {
    // TODO: Bug on challengerAddress because we use the proxy
    updateUsersChallengesStatistics(badge.account, challengerAddress, ruling);
  }
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
      `handleEvidence - not evidenceGroupIDItemID found for evidenceGroupID: {}, TX HASH: {}`,
      [evidenceGroupID.toHexString(), event.transaction.hash.toHexString()]
    );
    return;
  }

  const itemID = evidenceGroupIDItemID.itemID;
  const itemIDToEvidenceGroupIDToBadgeID = _ItemIDToEvidenceGroupIDToBadgeID.load(
    itemID
  );
  if (!itemIDToEvidenceGroupIDToBadgeID) {
    log.error(
      `handleEvidence- not itemIDToEvidenceGroupIDToBadgeID found for evidenceGroupID: {} and itemID: {}`,
      [evidenceGroupID.toHexString(), itemID.toString()]
    );
    return;
  }
  if (!itemIDToEvidenceGroupIDToBadgeID.badgeID) {
    log.warning(
      `handleEvidence - not itemIDToEvidenceGroupIDToBadgeID badgeID found for evidenceGroupID: {} and itemID: {}, item not TheBadge, ignoring..`,
      [evidenceGroupID.toHexString(), itemID.toString()]
    );
    return;
  }

  // Loads BadgeKlerosMetaData
  const badgeID = itemIDToEvidenceGroupIDToBadgeID.badgeID as string;
  const badgeKlerosMetadata = BadgeKlerosMetaData.load(badgeID);

  if (!badgeKlerosMetadata) {
    log.error(
      `handleEvidence - not badgeKlerosMetadata found for with ID: {}`,
      [badgeID.toString()]
    );
    return;
  }

  const requestID =
    itemID +
    "-" +
    badgeKlerosMetadata.numberOfRequests.minus(BigInt.fromI32(1)).toString();
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
  const ruling = event.params._ruling.toI32();

  const klerosBadgeIdToBadgeId = _KlerosBadgeIdToBadgeId.load(
    itemID.toHexString()
  );

  if (!klerosBadgeIdToBadgeId) {
    log.error(`handleRuling - klerosBadgeIdToBadgeId not found for id {}`, [
      itemID.toHexString()
    ]);
    return;
  }

  const badgeKlerosMetadata = BadgeKlerosMetaData.load(
    klerosBadgeIdToBadgeId.badgeId
  );

  if (!badgeKlerosMetadata) {
    log.error(`handleRuling - badgeKlerosMetadata not found for id {}`, [
      klerosBadgeIdToBadgeId.badgeId
    ]);
    return;
  }

  // Takes always the last request which is the one that's on dispute
  const requestIndex = badgeKlerosMetadata.numberOfRequests.minus(
    BigInt.fromI32(1)
  );
  const requestID = badgeKlerosMetadata.id + "-" + requestIndex.toString();
  const genericRequest = KlerosBadgeRequest.load(requestID);

  if (!genericRequest) {
    log.error("handleRuling - Request {} not found.", [requestID]);
    return;
  }

  genericRequest.resolutionTime = event.block.timestamp;
  genericRequest.save();

  // Updates user statistics
  const badge = Badge.load(klerosBadgeIdToBadgeId.badgeId);

  if (!badge) {
    log.error(`handleRuling - badge not found for id {}`, [
      klerosBadgeIdToBadgeId.badgeId
    ]);
    return;
  }

  let challengerAddress: string | null = null;
  if (genericRequest.challenger) {
    challengerAddress = (genericRequest.challenger as Bytes).toHexString();
  }
  updateUsersChallengesStatistics(badge.account, challengerAddress, ruling);
}
