import { BigInt, Bytes, log } from "@graphprotocol/graph-ts";
import {
  TheBadge,
  CreatorRegistered,
  BadgeModelCreated,
  TransferSingle
} from "../generated/TheBadge/TheBadge";

import {
  BadgeModel,
  Badge,
  ProtocolStatistic,
  UserStatistic
} from "../generated/schema";
import { loadUserOrGetDefault } from "./utils";

// event CreatorRegistered(address indexed creator, string metadata);
export function handleCreatorRegistered(event: CreatorRegistered): void {
  const contractAddress = event.address.toHexString();
  const id = event.params.creator.toHexString();

  const user = loadUserOrGetDefault(id);
  user.isCreator = true;
  user.creatorUri = event.params.metadata;
  user.save();

  // Register new statistic using the contractAddress
  // TODO this should be moved to the genesis event (which does not exists at the moment on the contract)
  let statistic = ProtocolStatistic.load(contractAddress);

  if (!statistic) {
    statistic = new ProtocolStatistic(contractAddress);
    statistic.badgeModelsCreatedAmount = BigInt.fromI32(0);
    statistic.badgesMintedAmount = BigInt.fromI32(0);
    statistic.badgesChallengedAmount = BigInt.fromI32(0);
    statistic.badgesOwnersAmount = BigInt.fromI32(0);
    statistic.badgeCreatorsAmount = BigInt.fromI32(0);
    statistic.badgeCuratorsAmount = BigInt.fromI32(0);
    statistic.badgeCurators = [];
    statistic.badgeCreators = [];
    statistic.save();
  }

  statistic.badgeCreatorsAmount = statistic.badgeCreatorsAmount.plus(
    BigInt.fromI32(1)
  );
  const auxCreators = statistic.badgeCreators;
  auxCreators.push(Bytes.fromHexString(id));
  statistic.badgeCreators = auxCreators;
  statistic.save();
}

// event BadgeModelCreated(uint256 indexed badgeModelId, string metadata);
export function handleBadgeModelCreated(event: BadgeModelCreated): void {
  const badgeModelId = event.params.badgeModelId;
  const theBadge = TheBadge.bind(event.address);
  const _badgeModel = theBadge.badgeModel(badgeModelId);

  // Badge model
  const badgeModel = new BadgeModel(badgeModelId.toString());
  badgeModel.uri = event.params.metadata;
  badgeModel.controllerType = _badgeModel.getControllerName();
  badgeModel.validFor = _badgeModel.getValidFor();
  badgeModel.creatorFee = _badgeModel.getMintCreatorFee();
  badgeModel.paused = false;
  badgeModel.creator = _badgeModel.getCreator().toHexString();
  badgeModel.badgesMintedAmount = BigInt.fromI32(0);
  badgeModel.createdAt = event.block.timestamp;
  badgeModel.contractAddress = event.address;
  badgeModel.save();

  // Statistics update
  const userStatistics = UserStatistic.load(badgeModel.creator);
  if (!userStatistics) {
    log.error("handleMint - userStatistics not found for user: {}", [
      badgeModel.creator
    ]);
    return;
  }

  userStatistics.createdBadgesModelAmount = userStatistics.createdBadgesModelAmount.plus(
    BigInt.fromI32(1)
  );
  userStatistics.save();

  const statistic = ProtocolStatistic.load(event.address.toHexString());
  if (statistic) {
    statistic.badgeModelsCreatedAmount = statistic.badgeModelsCreatedAmount.plus(
      BigInt.fromI32(1)
    );
    statistic.save();
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

  // user
  const userId = event.params.to.toHexString();

  const userStatistics = UserStatistic.load(userId);
  if (!userStatistics) {
    log.error("handleMint - userStatistics not found for user: {}", [userId]);
    return;
  }

  userStatistics.mintedBadgesAmount = userStatistics.mintedBadgesAmount.plus(
    BigInt.fromI32(1)
  );
  userStatistics.save();

  const statistic = ProtocolStatistic.load(event.address.toHexString());
  if (statistic) {
    statistic.badgesMintedAmount = statistic.badgesMintedAmount.plus(
      BigInt.fromI32(1)
    );

    // First time the user mints a badge, is a new badge owner
    if (userStatistics.mintedBadgesAmount.toString() == "1") {
      statistic.badgesOwnersAmount = statistic.badgesOwnersAmount.plus(
        BigInt.fromI32(1)
      );
    }
    statistic.save();
  }
}
