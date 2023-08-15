import { Address, BigInt, log } from "@graphprotocol/graph-ts";
import { LightGeneralizedTCR as LightGeneralizedTCRTemplate } from "../generated/templates";
import { LightGeneralizedTCR } from "../generated/templates/LightGeneralizedTCR/LightGeneralizedTCR";
import {
  BadgeModelKlerosMetaData,
  BadgeKlerosMetaData,
  _KlerosBadgeIdToBadgeId,
  KlerosBadgeRequest,
  Evidence,
  BadgeModel,
  _ItemIDToEvidenceGroupIDToBadgeID
} from "../generated/schema";
import {
  KlerosBadgeModelController,
  NewKlerosBadgeModel,
  MintKlerosBadge
} from "../generated/KlerosBadgeModelController/KlerosBadgeModelController";
import { TheBadge } from "../generated/TheBadge/TheBadge";
import {
  getArbitrationParamsIndex,
  getTCRRequestIndex,
  DISPUTE_OUTCOME_NONE
} from "./utils";

// event NewKlerosBadgeModel(uint256 indexed badgeModelId, address indexed tcrAddress, string registrationMetaEvidence, string clearingMetaEvidence)
export function handleNewKlerosBadgeModel(event: NewKlerosBadgeModel): void {
  const badgeModelId = event.params.badgeModelId;
  const tcrAddress = event.params.tcrAddress;
  const metadataUri = event.params.registrationMetaEvidence;
  const removalUri = event.params.clearingMetaEvidence;
  const badgeModel = BadgeModel.load(badgeModelId.toString());
  if (!badgeModel) {
    log.error(
      "handleNewKlerosBadgeModel - BadgeModel not found. badgeModelID: {}",
      [badgeModelId.toString()]
    );
    return;
  }

  LightGeneralizedTCRTemplate.create(tcrAddress);
  const tcrList = LightGeneralizedTCR.bind(tcrAddress);

  const badgeModelKlerosMetaData = new BadgeModelKlerosMetaData(
    badgeModelId.toString()
  );
  badgeModelKlerosMetaData.badgeModel = badgeModelId.toString();
  badgeModelKlerosMetaData.registrationUri = metadataUri;
  badgeModelKlerosMetaData.removalUri = removalUri;
  badgeModelKlerosMetaData.tcrList = tcrAddress;
  badgeModelKlerosMetaData.governor = tcrList.governor();
  badgeModelKlerosMetaData.arbitrator = tcrList.arbitrator();
  badgeModelKlerosMetaData.admin = tcrList.relayerContract();
  badgeModelKlerosMetaData.submissionBaseDeposit = tcrList.submissionBaseDeposit();
  badgeModelKlerosMetaData.challengePeriodDuration = tcrList.challengePeriodDuration();
  badgeModelKlerosMetaData.save();

  badgeModel.badgeModelKleros = badgeModelKlerosMetaData.id;
  badgeModel.save();
}

// event MintKlerosBadge(uint256 indexed badgeId, string evidence);
export function handleMintKlerosBadge(event: MintKlerosBadge): void {
  const klerosBadgeModelController = KlerosBadgeModelController.bind(
    event.address
  );
  const theBadge = TheBadge.bind(klerosBadgeModelController.theBadge());
  const badgeId = event.params.badgeId;

  const badgeModelId = theBadge
    .badges(badgeId)
    .getBadgeModelId()
    .toString();

  const _badgeModelKlerosMetaData = BadgeModelKlerosMetaData.load(badgeModelId);

  if (!_badgeModelKlerosMetaData) {
    log.error(
      "handleMintKlerosBadge - BadgeModel not found. badgeId {} badgeModelId {}",
      [badgeId.toString(), badgeModelId]
    );
    return;
  }

  const itemID = klerosBadgeModelController.klerosBadge(badgeId).getItemID();

  // request
  const requestIndex = getTCRRequestIndex(
    Address.fromBytes(_badgeModelKlerosMetaData.tcrList),
    itemID
  );
  const requestId = itemID.toHexString() + "-" + requestIndex.toString();
  const request = new KlerosBadgeRequest(requestId);
  const tcrListAddress = Address.fromBytes(_badgeModelKlerosMetaData.tcrList);
  const tcr = LightGeneralizedTCR.bind(event.address);
  request.type = "Registration";
  request.createdAt = event.block.timestamp;
  request.badgeKlerosMetaData = badgeId.toString();
  request.requestIndex = requestIndex;
  request.arbitrationParamsIndex = getArbitrationParamsIndex(tcrListAddress);
  request.requester = klerosBadgeModelController
    .klerosBadge(badgeId)
    .getCallee();
  request.numberOfEvidences = BigInt.fromI32(1);
  request.disputed = false;
  request.disputeOutcome = DISPUTE_OUTCOME_NONE;
  request.resolved = false;
  request.resolutionTime = BigInt.fromI32(0);
  request.arbitrator = tcr.arbitrator();
  request.save();

  const evidence = new Evidence(requestId + "-" + "0");
  evidence.uri = event.params.evidence;
  evidence.timestamp = event.block.timestamp;
  evidence.request = request.id;
  evidence.sender = event.transaction.from;
  evidence.save();

  // KlerosBadgeIdToBadgeId
  const klerosBadgeIdToBadgeId = new _KlerosBadgeIdToBadgeId(
    itemID.toHexString()
  );
  klerosBadgeIdToBadgeId.badgeId = badgeId.toString();
  klerosBadgeIdToBadgeId.save();

  // BadgeKlerosMetaData
  const badgeKlerosMetaData = new BadgeKlerosMetaData(badgeId.toString());
  badgeKlerosMetaData.badge = badgeId.toString();
  badgeKlerosMetaData.itemID = itemID;
  badgeKlerosMetaData.reviewDueDate = event.block.timestamp.plus(
    _badgeModelKlerosMetaData.challengePeriodDuration
  );
  badgeKlerosMetaData.numberOfRequests = BigInt.fromI32(1);
  badgeKlerosMetaData.save();

  const itemIDToEvidenceGroupIDToBadgeID = _ItemIDToEvidenceGroupIDToBadgeID.load(
    itemID.toHexString()
  );

  if (!itemIDToEvidenceGroupIDToBadgeID) {
    log.error("handleMintKlerosBadge - ItemIDEvidenceGroupID not found!!: {}", [
      itemID.toHexString()
    ]);
    return;
  }
  itemIDToEvidenceGroupIDToBadgeID.badgeID = badgeId.toString();
  itemIDToEvidenceGroupIDToBadgeID.save();
}
