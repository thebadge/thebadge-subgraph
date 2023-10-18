import { log } from "@graphprotocol/graph-ts";
import { LightGeneralizedTCR as LightGeneralizedTCRTemplate } from "../generated/templates";
import { LightGeneralizedTCR } from "../generated/templates/LightGeneralizedTCR/LightGeneralizedTCR";
import {
  BadgeModelThirdPartyMetaData,
  BadgeModel,
  ControllerConfig,
  BadgeThirdPartyMetaData
} from "../generated/schema";
import {
  Initialize,
  NewThirdPartyBadgeModel,
  ThirdPartyBadgeMinted,
  TpBadgeModelController
} from "../generated/TpBadgeModelController/TpBadgeModelController";
import { TpBadgeModelControllerStore } from "../generated/TpBadgeModelController/TpBadgeModelControllerStore";
import { getTBStatus } from "./utils";

// event Initialize(address indexed admin);
export function handleContractInitialized(event: Initialize): void {
  const contractAddress = event.address.toHexString();
  const admin = event.params.admin;
  const tpBadgeModelController = TpBadgeModelController.bind(event.address);
  const tpBadgeModelControllerStore = TpBadgeModelControllerStore.bind(
    tpBadgeModelController.tpBadgeModelControllerStore()
  );

  const controllerConfig = new ControllerConfig(contractAddress);
  controllerConfig.verifyUserProtocolFee = tpBadgeModelController.getVerifyUserProtocolFee();
  controllerConfig.contractAdmin = admin;
  controllerConfig.controllerName = "thirdParty";
  controllerConfig.tcrFactory = tpBadgeModelControllerStore.tcrFactory();
  controllerConfig.arbitrator = tpBadgeModelControllerStore.arbitrator();
  controllerConfig.generalProtocolConfig = tpBadgeModelController
    .theBadgeModels()
    .toHexString();
  controllerConfig.save();
}

// event NewThirdPartyBadgeModel(uint256 indexed badgeModelId, address indexed tcrAddress)
export function handleNewThirdPartyBadgeModel(
  event: NewThirdPartyBadgeModel
): void {
  const badgeModelId = event.params.badgeModelId;
  const tcrAddress = event.params.tcrAddress;

  const badgeModel = BadgeModel.load(badgeModelId.toString());
  if (!badgeModel) {
    log.error(
      "handleNewThirdPartyBadgeModel - BadgeModel not found. badgeModelID: {}",
      [badgeModelId.toString()]
    );
    return;
  }

  LightGeneralizedTCRTemplate.create(tcrAddress);
  const tcrList = LightGeneralizedTCR.bind(tcrAddress);

  const badgeModelThirdPartyMetaData = new BadgeModelThirdPartyMetaData(
    badgeModelId.toString()
  );
  badgeModelThirdPartyMetaData.badgeModel = badgeModelId.toString();
  badgeModelThirdPartyMetaData.tcrList = tcrAddress;
  badgeModelThirdPartyMetaData.governor = tcrList.governor();
  badgeModelThirdPartyMetaData.arbitrator = tcrList.arbitrator();
  badgeModelThirdPartyMetaData.admin = tcrList.relayerContract();
  badgeModelThirdPartyMetaData.submissionBaseDeposit = tcrList.submissionBaseDeposit();
  badgeModelThirdPartyMetaData.challengePeriodDuration = tcrList.challengePeriodDuration();
  badgeModelThirdPartyMetaData.save();

  badgeModel.badgeModelThirdParty = badgeModelThirdPartyMetaData.id;
  badgeModel.save();
}

// event ThirdPartyBadgeMinted(uint256 indexed badgeId, bytes32 indexed tcrItemId);
export function handleMintThirdPartyBadge(event: ThirdPartyBadgeMinted): void {
  const tpBadgeModelController = TpBadgeModelController.bind(event.address);
  const tpBadgeModelControllerStore = TpBadgeModelControllerStore.bind(
    tpBadgeModelController.tpBadgeModelControllerStore()
  );
  const badgeId = event.params.badgeId;

  const itemID = tpBadgeModelControllerStore
    .thirdPartyBadges(badgeId)
    .getItemID();

  const tpBadge = tpBadgeModelControllerStore.getBadge(badgeId);
  const badgeModel = tpBadgeModelControllerStore.getBadgeModel(
    tpBadge.badgeModelId
  );
  const tcrList = LightGeneralizedTCR.bind(badgeModel.tcrList);
  const itemStatus = tcrList.getItemInfo(itemID).getStatus();

  const badgeThirdPartyMetaData = new BadgeThirdPartyMetaData(
    badgeId.toString()
  );
  badgeThirdPartyMetaData.badge = badgeId.toString();
  badgeThirdPartyMetaData.itemID = itemID;
  badgeThirdPartyMetaData.tcrStatus = getTBStatus(itemStatus);
  badgeThirdPartyMetaData.save();
}
