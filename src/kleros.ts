import { Address, BigInt, log } from "@graphprotocol/graph-ts";
import { LightGeneralizedTCR as LightGeneralizedTCRTemplate } from "../generated/templates";
import {
  ItemStatusChange,
  LightGeneralizedTCR,
  LightGeneralizedTCR__requestsDisputeDataResult
} from "../generated/templates/LightGeneralizedTCR/LightGeneralizedTCR";
import {
  BadgeModelKlerosMetaData,
  Badge,
  BadgeKlerosMetaData,
  KlerosBadgeRequest,
  KlerosBadgeIdToBadgeId,
  LItem,
  LRequest,
  LRegistry,
  EvidenceGroupIDToLRequest
} from "../generated/schema";
import {
  KlerosController,
  NewKlerosBadgeModel,
  mintKlerosBadge
} from "../generated/KlerosController/KlerosController";
import { TheBadge } from "../generated/TheBadge/TheBadge";
import {
  STATUS_ABSENT,
  STATUS_CLEARING_REQUESTED,
  STATUS_REGISTERED,
  STATUS_REGISTRATION_REQUESTED,
  getArbitrationParamsIndex,
  getTCRRequestIndex,
  buildNewRound,
  getExtendedStatus,
  updateCounters, REGISTRATION_REQUESTED, NONE, ZERO_ADDRESS, getStatus
} from "./utils";
import {Dispute, RequestSubmitted} from "../generated/KlerosController/LightGeneralizedTCR";

// event NewKlerosBadgeModel(uint256 indexed badgeModelId, address indexed tcrAddress, string metadataUri)
export function handleNewKlerosBadgeModel(event: NewKlerosBadgeModel): void {
  const badgeModelId = event.params.badgeModelId;

  LightGeneralizedTCRTemplate.create(event.params.tcrAddress);
  const tcrList = LightGeneralizedTCR.bind(event.params.tcrAddress);

  const badgeModelKlerosMetaData = new BadgeModelKlerosMetaData(
    badgeModelId.toString()
  );
  badgeModelKlerosMetaData.badgeModelId = badgeModelId.toString();
  badgeModelKlerosMetaData.registrationUri = event.params.metadataUri;
  badgeModelKlerosMetaData.removalUri = "ipfs://TODO";
  badgeModelKlerosMetaData.tcrList = event.params.tcrAddress;
  badgeModelKlerosMetaData.submissionBaseDeposit = tcrList.submissionBaseDeposit();
  badgeModelKlerosMetaData.challengePeriodDuration = tcrList.challengePeriodDuration();
  badgeModelKlerosMetaData.save();
}

// event MintKlerosBadge(uint256 indexed badgeId, string evidence);
export function handleMintKlerosBadge(event: mintKlerosBadge): void {
  const klerosController = KlerosController.bind(event.address);
  const theBadge = TheBadge.bind(klerosController.theBadge());
  const badgeIdBigInt = event.params.badgeId;
  const badgeId = badgeIdBigInt.toString();

  const badgeModelId = theBadge
    .badge(badgeIdBigInt)
    .getBadgeModelId()
    .toString();

  const _badgeModelKlerosMetaData = BadgeModelKlerosMetaData.load(badgeModelId);

  if (!_badgeModelKlerosMetaData) {
    log.error("KlerosBadgeType not found. badgeId {} badgeModelId {}", [
      badgeId,
      badgeModelId
    ]);
    return;
  }

  // BadgeKlerosMetaData
  const itemId = klerosController.klerosBadge(badgeIdBigInt).getItemID();

  const badgeKlerosMetaData = new BadgeKlerosMetaData(badgeId);
  badgeKlerosMetaData.badge = badgeId;
  badgeKlerosMetaData.itemID = itemId;
  badgeKlerosMetaData.reviewDueDate = event.block.timestamp.plus(
    _badgeModelKlerosMetaData.challengePeriodDuration
  );
  badgeKlerosMetaData.save();

  // KlerosBadgeIdToBadgeId
  const klerosBadgeIdToBadgeId = new KlerosBadgeIdToBadgeId(
    itemId.toHexString()
  );
  klerosBadgeIdToBadgeId.badgeId = badgeId;
  klerosBadgeIdToBadgeId.save();

  // request
  const requestIndex = getTCRRequestIndex(
    Address.fromBytes(_badgeModelKlerosMetaData.tcrList),
    badgeKlerosMetaData.itemID
  );
  const requestId = badgeId + "-" + requestIndex.toString();
  const request = new KlerosBadgeRequest(requestId);
  const tcrListAddress = Address.fromBytes(_badgeModelKlerosMetaData.tcrList);
  request.type = "Registration";
  request.createdAt = event.block.timestamp;
  request.badgeKlerosMetaData = badgeId;
  request.requestIndex = requestIndex;
  request.arbitrationParamsIndex = getArbitrationParamsIndex(tcrListAddress);
  request.requester = klerosController.klerosBadge(badgeIdBigInt).getCallee();

  // todo remove
  // Both request.disputeId and request.challenger are left null as this is the first time when the badge is created.
  //  request.disputeId = 1

  //  klerosController.klerosBadge(badgeId).request.disputeId = 1;
  //request.challenger = 1;*/

  request.requestBadgeEvidenceUri = event.params.evidence;
  //removeOrChallengeEvidenceUri: String;
  request.extraEvidenceUris = [];
  // request.challenger: Bytes;
  request.save();
}

// event ItemStatusChange(bytes32 indexed _itemID, bool _updatedDirectly);
export function handleItemStatusChange(event: ItemStatusChange): void {
  const klerosBadgeIdToBadgeId = KlerosBadgeIdToBadgeId.load(
    event.params._itemID.toHexString()
  );

  if (!klerosBadgeIdToBadgeId) {
    log.error("klerosBadgeIdToBadgeId not found for id {}", [
      event.params._itemID.toHexString()
    ]);
    return;
  }

  const badge = Badge.load(klerosBadgeIdToBadgeId.badgeId);
  if (!badge) {
    log.error("badge not found for id {}", [klerosBadgeIdToBadgeId.badgeId]);
    return;
  }

  const tcrList = LightGeneralizedTCR.bind(event.address);
  const item = tcrList.items(event.params._itemID);

  if (BigInt.fromI32(item.getStatus()) == STATUS_ABSENT) {
    badge.status = "Absent";
  }

  if (BigInt.fromI32(item.getStatus()) == STATUS_REGISTRATION_REQUESTED) {
    badge.status = "Requested";
  }

  if (BigInt.fromI32(item.getStatus()) == STATUS_REGISTERED) {
    badge.status = "Approved";
  }

  if (BigInt.fromI32(item.getStatus()) == STATUS_CLEARING_REQUESTED) {
    badge.status = "RequestRemoval";
  }

  badge.save();
}

// event Dispute(IArbitrator indexed _arbitrator, uint indexed _disputeID, uint _metaEvidenceID, uint _evidenceGroupID);
export function handleDispute(event: Dispute): void {
  // TODO: handle evidence
  // TODO: handle dispute data
  log.info("Init Handle dispute", []);

  // @todo (agustin) fix
  // const klerosBadgeIdToBadgeId = KlerosBadgeIdToBadgeId.load(
  //   event.params._itemID.toString()
  // );

  //
  // log.info("Init Handle dispute 2",[])
  // if (!klerosBadgeIdToBadgeId) {
  //   log.error("klerosBadgeIdToBadgeId not found for id {}", [
  //     event.params._itemID.toHexString(),
  //   ]);
  //   return;
  // }
  //
  // log.info("Init Handle dispute 3",[])
  // const badge = Badge.load(klerosBadgeIdToBadgeId.badgeId);
  // log.info("Init Handle dispute 4",[])
  // if (!badge) {
  //   log.error("badge not found for id {}", [klerosBadgeIdToBadgeId.badgeId]);
  //   return;
  // }
  //
  // log.info("Finish Handle dispute",[])
  // badge.status = "Challenged";
  // badge.save();
  // log.info("Init Handle dispute saved", [])
}

export function handleRequestChallenged(event: Dispute): void {
  log.error("This is a test of handleRequestChallenged", []);
  let tcr = LightGeneralizedTCR.bind(event.address);
  let itemID = tcr.arbitratorDisputeIDToItemID(
    event.params._arbitrator,
    event.params._disputeID
  );
  let graphItemID = itemID.toHexString() + "@" + event.address.toHexString();
  let item = LItem.load(graphItemID);
  if (!item) {
    log.warning(`LItem {} not found.`, [graphItemID]);
    return;
  }

  let previousStatus = getExtendedStatus(item.disputed, item.status);
  item.disputed = true;
  item.latestChallenger = event.transaction.from;
  let newStatus = getExtendedStatus(item.disputed, item.status);

  let requestIndex = item.numberOfRequests.minus(BigInt.fromI32(1));
  let requestID = graphItemID + "-" + requestIndex.toString();
  let request = LRequest.load(requestID);
  if (!request) {
    log.error(`LRequest {} not found.`, [requestID]);
    return;
  }

  request.disputed = true;
  request.challenger = event.transaction.from;
  request.numberOfRounds = BigInt.fromI32(2);
  request.disputeID = event.params._disputeID;

  let newRoundID =
    requestID +
    "-" +
    request.numberOfRounds.minus(BigInt.fromI32(1)).toString();
  let newRound = buildNewRound(newRoundID, request.id, event.block.timestamp);

  // Accounting.
  updateCounters(previousStatus, newStatus, event.address);

  newRound.save();
  request.save();
  item.save();
}

export function handleRequestSubmitted(event: RequestSubmitted): void {
  log.error("This is a test of handleRequestSubmitted", []);
  let graphItemID =
      event.params._itemID.toHexString() + '@' + event.address.toHexString();

  let tcr = LightGeneralizedTCR.bind(event.address);
  let itemInfo = tcr.getItemInfo(event.params._itemID);
  let item = LItem.load(graphItemID);
  if (!item) {
    log.error(`LItem for graphItemID {} not found.`, [graphItemID]);
    return;
  }

  let registry = LRegistry.load(event.address.toHexString());
  if (!registry) {
    log.error(`LRegistry at address {} not found`, [
      event.address.toHexString(),
    ]);
    return;
  }

  // `previousStatus` and `newStatus` are used for accounting.
  // Note that if this is the very first request of an item,
  // item.status and item.dispute are dirty because they were set by
  // handleNewItem, executed before this handler and so `previousStatus`
  // would be wrong. We use a condition to detect if its the very
  // first request and if so, ignore its contents (see below in accounting).
  let previousStatus = getExtendedStatus(item.disputed, item.status);

  item.numberOfRequests = item.numberOfRequests.plus(BigInt.fromI32(1));
  item.status = getStatus(itemInfo.value0);
  item.latestRequester = event.transaction.from;
  item.latestRequestResolutionTime = BigInt.fromI32(0);
  item.latestRequestSubmissionTime = event.block.timestamp;

  let newStatus = getExtendedStatus(item.disputed, item.status);

  let requestIndex = item.numberOfRequests.minus(BigInt.fromI32(1));
  let requestID = graphItemID + '-' + requestIndex.toString();

  let request = new LRequest(requestID);
  request.disputed = false;
  request.arbitrator = tcr.arbitrator();
  request.arbitratorExtraData = tcr.arbitratorExtraData();
  request.challenger = ZERO_ADDRESS;
  request.requester = event.transaction.from;
  request.numberOfEvidence = BigInt.fromI32(0);
  request.item = item.id;
  request.registry = registry.id;
  request.resolutionTime = BigInt.fromI32(0);
  request.disputeOutcome = NONE;
  request.resolved = false;
  request.disputeID = BigInt.fromI32(0);
  request.submissionTime = event.block.timestamp;
  request.numberOfRounds = BigInt.fromI32(1);
  request.requestType = item.status;
  request.evidenceGroupID = event.params._evidenceGroupID;
  request.creationTx = event.transaction.hash;
  if (request.requestType == REGISTRATION_REQUESTED)
    request.metaEvidence = registry.registrationMetaEvidence;
  else request.metaEvidence = registry.clearingMetaEvidence;

  let roundID = requestID + '-0';

  // Note that everything related to the deposit (e.g. contribution creation)
  // is handled in handleContribution.
  let round = buildNewRound(roundID, requestID, event.block.timestamp);

  // Accounting.
  if (itemInfo.value1.equals(BigInt.fromI32(1))) {
    // This is the first request for this item, which must be
    // a registration request.
    registry.numberOfRegistrationRequested = registry.numberOfRegistrationRequested.plus(
        BigInt.fromI32(1),
    );
  } else {
    updateCounters(previousStatus, newStatus, event.address);
  }

  let evidenceGroupIDToLRequest = new EvidenceGroupIDToLRequest(
      event.params._evidenceGroupID.toString() + "@" + event.address.toHexString())
  evidenceGroupIDToLRequest.request = requestID

  evidenceGroupIDToLRequest.save()
  round.save();
  request.save();
  item.save();
  registry.save();
}