import { BigInt, Bytes, log } from "@graphprotocol/graph-ts";
import {
  TheBadge,
  CreatorRegistered,
  BadgeModelCreated,
  TransferSingle
} from "../generated/TheBadge/TheBadge";

import { BadgeModel, Badge, ProtocolStatistic } from "../generated/schema";
import {
  handleMintStatisticsUpdate,
  loadProtocolStatisticsOrGetDefault,
  loadUserCreatorStatisticsOrGetDefault,
  loadUserOrGetDefault
} from "./utils";

// event CreatorRegistered(address indexed creator, string metadata);
export function handleCreatorRegistered(event: CreatorRegistered): void {
  const contractAddress = event.address.toHexString();
  const id = event.params.creator.toHexString();

  const user = loadUserOrGetDefault(id);
  user.isCreator = true;
  user.creatorUri = event.params.metadata;
  user.save();

  // Register new statistic using the contractAddress
  const statistic = loadProtocolStatisticsOrGetDefault(contractAddress);

  statistic.badgeCreatorsAmount = statistic.badgeCreatorsAmount.plus(
    BigInt.fromI32(1)
  );
  const auxCreators = statistic.badgeCreators;
  auxCreators.push(Bytes.fromHexString(id));
  statistic.badgeCreators = auxCreators;
  statistic.save();

  // Create stats for new creator
  const creatorStatistic = loadUserCreatorStatisticsOrGetDefault(
    contractAddress
  );
  creatorStatistic.save();
}

// event BadgeModelCreated(uint256 indexed badgeModelId, string metadata);
export function handleBadgeModelCreated(event: BadgeModelCreated): void {
  const badgeModelId = event.params.badgeModelId;
  const theBadge = TheBadge.bind(event.address);
  const _badgeModel = theBadge.badgeModel(badgeModelId);
  const creatorAddress = _badgeModel.getCreator().toHexString();

  // Note: ideally the user should be already created and we should throw an exception here it's not found
  // But on the smart contract there is no restriction about registered users, so it could happen that an user that was not registered
  // Emits the BadgeModelCreated before the CreatorRegistered, therefore we need to create the user entity here
  const user = loadUserOrGetDefault(creatorAddress);

  // Badge model
  const badgeModel = new BadgeModel(badgeModelId.toString());
  badgeModel.uri = event.params.metadata;
  badgeModel.controllerType = _badgeModel.getControllerName();
  badgeModel.validFor = _badgeModel.getValidFor();
  badgeModel.creatorFee = _badgeModel.getMintCreatorFee();
  badgeModel.protocolFee = _badgeModel.getMintProtocolFee();
  badgeModel.paused = false;
  badgeModel.creator = user.id;
  badgeModel.badgesMintedAmount = BigInt.fromI32(0);
  badgeModel.createdAt = event.block.timestamp;
  badgeModel.contractAddress = event.address;
  badgeModel.save();

  // Updates the user with the new created badge
  const auxCreatedBadges = user.createdBadgeModels;
  auxCreatedBadges.push(badgeModel.id);
  user.createdBadgeModels = auxCreatedBadges;
  user.save();

  // Statistics update
  const creatorStatistics = loadUserCreatorStatisticsOrGetDefault(
    badgeModel.creator
  );

  creatorStatistics.createdBadgeModelsAmount = creatorStatistics.createdBadgeModelsAmount.plus(
    BigInt.fromI32(1)
  );
  creatorStatistics.save();

  const protocolStatistics = ProtocolStatistic.load(
    event.address.toHexString()
  );
  if (protocolStatistics) {
    protocolStatistics.badgeModelsCreatedAmount = protocolStatistics.badgeModelsCreatedAmount.plus(
      BigInt.fromI32(1)
    );
    protocolStatistics.save();
  }
}

// event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value);
export function handleMint(event: TransferSingle): void {
  const theBadge = TheBadge.bind(event.address);
  const badgeID = event.params.id;
  const _badge = theBadge.badge(badgeID);
  const badgeModelID = _badge.getBadgeModelId().toString();
  // const badgeModel = theBadge.badgeModel(_badge.getBadgeModelId());

  // Badge model
  const badgeModel = BadgeModel.load(badgeModelID);

  if (!badgeModel) {
    log.error("handleMint - BadgeModel not found. badgeId {} badgeModelId {}", [
      badgeID.toString(),
      badgeModelID
    ]);
    return;
  }

  badgeModel.badgesMintedAmount = badgeModel.badgesMintedAmount.plus(
    BigInt.fromI32(1)
  );
  badgeModel.save();

  // badge
  const badgeId = event.params.id;
  const badge = new Badge(badgeId.toString());
  badge.badgeModel = badgeModelID;
  badge.account = event.params.to.toHexString();
  badge.status = "Requested";
  badge.validUntil = _badge.getDueDate();
  badge.createdAt = event.block.timestamp;
  badge.createdTxHash = event.transaction.hash;
  badge.uri = theBadge.uri(badgeId);
  badge.save();

  // Loads or creates an user if does not exists
  const user = loadUserOrGetDefault(event.params.to.toHexString());

  // Updates statistics
  handleMintStatisticsUpdate(
    user.id,
    badgeModel.creator,
    badgeModel.id,
    badgeModel.contractAddress.toHexString()
  );
}
