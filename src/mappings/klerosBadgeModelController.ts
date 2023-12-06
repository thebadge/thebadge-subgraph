import { Address, BigInt, log } from "@graphprotocol/graph-ts";
import { LightGeneralizedTCR as LightGeneralizedTCRTemplate } from "../../generated/templates";
import { LightGeneralizedTCR } from "../../generated/templates/LightGeneralizedTCR/LightGeneralizedTCR";
import {
  BadgeModelKlerosMetaData,
  BadgeKlerosMetaData,
  _KlerosBadgeIdToBadgeId,
  KlerosBadgeRequest,
  Evidence,
  BadgeModel,
  _ItemIDToEvidenceGroupIDToBadgeID,
  ControllerConfig
} from "../../generated/schema";
import {
  KlerosBadgeModelController,
  NewKlerosBadgeModel,
  MintKlerosBadge,
  Initialize
} from "../../generated/KlerosBadgeModelController/KlerosBadgeModelController";
import {
  getArbitrationParamsIndex,
  getTCRRequestIndex,
  DISPUTE_OUTCOME_NONE,
  getTBStatus
} from "../utils";
import { TheBadgeStore } from "../../generated/TheBadge/TheBadgeStore";
import { TheBadgeModels } from "../../generated/TheBadgeModels/TheBadgeModels";
import { KlerosBadgeModelControllerStore } from "../../generated/KlerosBadgeModelController/KlerosBadgeModelControllerStore";
import { BadgeModelBuilder } from "../utils/builders/badgeModelBuilder";
import { KlerosBadgeRequestBuilder } from "../utils/builders/KlerosBadgeRequestBuilder";

// event Initialize(address indexed admin,address tcrFactory);
export function handleKlerosContractInitialized(event: Initialize): void {
  const contractAddress = event.address.toHexString();
  const klerosBadgeModelController = KlerosBadgeModelController.bind(
    event.address
  );
  const admin = event.params.admin;
  const tcrFactory = event.params.tcrFactory;

  const klerosBadgeModelControllerStore = KlerosBadgeModelControllerStore.bind(
    klerosBadgeModelController.klerosBadgeModelControllerStore()
  );
  const controllerConfig = new ControllerConfig(contractAddress);
  controllerConfig.verifyUserProtocolFee = klerosBadgeModelController.getVerifyUserProtocolFee();
  controllerConfig.tcrFactory = tcrFactory;
  controllerConfig.contractAdmin = admin;
  controllerConfig.controllerName = "kleros";
  controllerConfig.arbitrator = klerosBadgeModelControllerStore.arbitrator();
  controllerConfig.generalProtocolConfig = klerosBadgeModelController
    .theBadgeModels()
    .toHexString();
  controllerConfig.save();
}

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
  const theBadgeModels = TheBadgeModels.bind(
    klerosBadgeModelController.theBadgeModels()
  );
  const theBadgeStore = TheBadgeStore.bind(theBadgeModels._badgeStore());
  const badgeId = event.params.badgeId;

  const badgeModelId = theBadgeStore
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

  const klerosBadgeModelControllerStore = KlerosBadgeModelControllerStore.bind(
    klerosBadgeModelController.klerosBadgeModelControllerStore()
  );
  const itemID = klerosBadgeModelControllerStore
    .klerosBadges(badgeId)
    .getItemID();

  // request
  const requestIndex = getTCRRequestIndex(
    Address.fromBytes(_badgeModelKlerosMetaData.tcrList),
    itemID
  );
  const tcrListAddress = Address.fromBytes(_badgeModelKlerosMetaData.tcrList);
  const tcr = LightGeneralizedTCR.bind(tcrListAddress);

  const requestID = itemID.toHexString() + "-" + requestIndex.toString();
  const request = new KlerosBadgeRequestBuilder({
    requestID,
    createdAt: event.block.timestamp,
    badgeKlerosMetadata: badgeId.toString(),
    type: "Registration",
    requestIndex,
    tcrListAddress,
    requesterAddress: klerosBadgeModelControllerStore
      .klerosBadges(badgeId)
      .getCallee(),
    arbitrator: tcr.arbitrator()
  }).build();

  request.save();

  const evidence = new Evidence(requestID + "-" + "0");
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
  const itemStatus = tcr.getItemInfo(itemID).getStatus();
  const badgeKlerosMetaData = new BadgeKlerosMetaData(badgeId.toString());
  badgeKlerosMetaData.badge = badgeId.toString();
  badgeKlerosMetaData.itemID = itemID;
  badgeKlerosMetaData.reviewDueDate = event.block.timestamp.plus(
    _badgeModelKlerosMetaData.challengePeriodDuration
  );
  badgeKlerosMetaData.numberOfRequests = BigInt.fromI32(1);
  badgeKlerosMetaData.tcrStatus = getTBStatus(itemStatus);
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
