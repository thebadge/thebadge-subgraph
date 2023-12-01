import { BadgeModel, User } from "../../../generated/schema";
import { BigInt, dataSource } from "@graphprotocol/graph-ts";
import { BadgeModelCreated } from "../../../generated/TheBadgeModels/TheBadgeModels";
import { TheBadgeStore__badgeModelsResult } from "../../../generated/TheBadge/TheBadgeStore";

export class BadgeModelBuilder {
  private badgeModel: BadgeModel;

  constructor(
    badgeModelId: string,
    _badgeModel: TheBadgeStore__badgeModelsResult,
    user: User,
    event: BadgeModelCreated
  ) {
    this.badgeModel = new BadgeModel(badgeModelId);
    this.badgeModel.uri = _badgeModel.getMetadata();
    this.badgeModel.controllerType = _badgeModel.getControllerName();
    this.badgeModel.validFor = _badgeModel.getValidFor();
    this.badgeModel.creatorFee = _badgeModel.getMintCreatorFee();
    this.badgeModel.protocolFeeInBps = _badgeModel.getMintProtocolFee();
    this.badgeModel.totalFeesGenerated = BigInt.fromI32(0);
    this.badgeModel.paused = false;
    this.badgeModel.creator = user.id;
    this.badgeModel.badgesMintedAmount = BigInt.fromI32(0);
    this.badgeModel.createdAt = event.block.timestamp;
    this.badgeModel.contractAddress = event.address;
    this.badgeModel.createdTxHash = event.transaction.hash;
    this.badgeModel.version = _badgeModel.getVersion();
    this.badgeModel.networkName = dataSource.network();
  }

  build(): BadgeModel {
    return this.badgeModel;
  }
}
