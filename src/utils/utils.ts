import { BigInt, Bytes, log } from "@graphprotocol/graph-ts";
import {
  BadgeModel,
  CreatorStatistic,
  CuratorStatistic,
  ProtocolStatistic,
  User,
  UserStatistic
} from "../../generated/schema";

export function loadUserOrGetDefault(id: string): User {
  let user = User.load(id);
  if (user) {
    return user;
  }

  user = new User(id);
  user.isCreator = false;
  user.isCurator = false;
  user.isVerified = false;
  user.creatorUri = null;
  user.createdBadgeModels = [];
  user.save();

  loadUserStatisticsOrGetDefault(id);
  return user;
}

export function loadUserStatisticsOrGetDefault(
  userAddress: string
): UserStatistic {
  let userStatistics = UserStatistic.load(userAddress);
  if (!userStatistics) {
    userStatistics = new UserStatistic(userAddress);
    // User statistics
    userStatistics.timeOfLastChallengeReceived = BigInt.fromI32(0);
    userStatistics.challengesReceivedAmount = BigInt.fromI32(0);
    userStatistics.challengesReceivedLostAmount = BigInt.fromI32(0);
    userStatistics.challengesReceivedWonAmount = BigInt.fromI32(0);
    userStatistics.mintedBadgesAmount = BigInt.fromI32(0);

    userStatistics.user = userAddress;
    userStatistics.save();
  }
  return userStatistics;
}

export function loadProtocolStatisticsOrGetDefault(
  contractAddress: string
): ProtocolStatistic {
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

  return statistic;
}

export function loadUserCreatorStatisticsOrGetDefault(
  userAddress: string
): CreatorStatistic {
  let creatorStatistics = CreatorStatistic.load(userAddress);
  if (creatorStatistics) {
    return creatorStatistics;
  }

  creatorStatistics = new CreatorStatistic(userAddress);
  // Creator statistics
  creatorStatistics.userStatistic = userAddress;
  creatorStatistics.createdBadgesModelAmount = BigInt.fromI32(0);
  creatorStatistics.createdBadgesMintedAmount = BigInt.fromI32(0);
  creatorStatistics.allTimeBadgeMinters = [];
  creatorStatistics.allTimeBadgeMintersAmount = BigInt.fromI32(0);
  creatorStatistics.createdBadgeIdMostPopular = BigInt.fromI32(0);

  creatorStatistics.save();
  return creatorStatistics;
}

export function loadUserCuratorStatisticsOrGetDefault(
  userAddress: string
): CuratorStatistic {
  let curatorStatistics = CuratorStatistic.load(userAddress);

  if (!curatorStatistics) {
    curatorStatistics = new CuratorStatistic(userAddress);
    curatorStatistics.userStatistic = userAddress;
    curatorStatistics.challengesMadeAmount = BigInt.fromI32(0);
    curatorStatistics.challengesMadeLostAmount = BigInt.fromI32(0);
    curatorStatistics.challengesMadeWonAmount = BigInt.fromI32(0);
    curatorStatistics.save();
  }

  return curatorStatistics;
}

export function findAddressInArray(array: Bytes[], address: string): boolean {
  let found = false;
  // FindIndex not supported in assemblyScript
  for (let i = 0; i < array.length; i++) {
    if (array[i].toHexString().toLowerCase() == address.toLowerCase()) {
      found = true;
      return found;
    }
  }
  return found;
}

function getBadgesMintedAmountForBadgeModel(badgeModelId: string): BigInt {
  const badgeModel = BadgeModel.load(badgeModelId);

  if (!badgeModel) {
    log.error(
      "getBadgesMintedAmountForBadgeModel - badgeModel not found with Id: {}",
      [badgeModelId]
    );
    return BigInt.fromI32(0);
  }

  return badgeModel.badgesMintedAmount;
}

function findMostPopularCreatedBadgeId(creatorId: string): BigInt | null {
  const creator = User.load(creatorId);

  if (!creator) {
    log.error("findMostPopularCreatedBadgeId - creator not found with Id: {}", [
      creatorId
    ]);
    return null;
  }

  if (!creator.createdBadgeModels) {
    log.error(
      "findMostPopularCreatedBadgeId - no createdBadgeModels found for user Id: {} !!",
      [creatorId]
    );
    return null;
  }

  let mostPopular: BigInt | null = null;
  const iterableArray = creator.createdBadgeModels as string[];
  let auxCounter = BigInt.fromI32(0);
  for (let i = 0; i < iterableArray.length; i++) {
    const badgeModelId = iterableArray[i];
    const newMintedBadges = getBadgesMintedAmountForBadgeModel(badgeModelId);

    if (auxCounter.lt(newMintedBadges)) {
      mostPopular = BigInt.fromString(badgeModelId);
      auxCounter = newMintedBadges;
    }
  }

  return mostPopular;
}

export function handleMintStatisticsUpdate(
  userId: string,
  creatorId: string,
  badgeModelId: string,
  protocolStatisticsId: string
): void {
  const userStatistics = UserStatistic.load(userId);
  if (!userStatistics) {
    log.error(
      "handleMintStatisticsUpdate - userStatistics not found for user: {}",
      [userId]
    );
    return;
  }

  // Updates MINTER user statistics
  userStatistics.mintedBadgesAmount = userStatistics.mintedBadgesAmount.plus(
    BigInt.fromI32(1)
  );
  userStatistics.save();

  ////  ----------------- ///

  // Update protocol statistics
  const statistic = loadProtocolStatisticsOrGetDefault(protocolStatisticsId);

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

  ////  ----------------- ///

  // Updates CREATOR user statistics
  const creatorStatistics = CreatorStatistic.load(creatorId);
  if (!creatorStatistics) {
    log.error(
      "handleMintStatisticsUpdate - creatorStatistics not found for CREATOR: {}",
      [creatorId]
    );
    return;
  }
  creatorStatistics.createdBadgesMintedAmount = creatorStatistics.createdBadgesMintedAmount.plus(
    BigInt.fromI32(1)
  );

  const minterFound = findAddressInArray(
    creatorStatistics.allTimeBadgeMinters,
    userId
  );
  if (!minterFound) {
    const auxMinters = creatorStatistics.allTimeBadgeMinters;
    auxMinters.push(Bytes.fromHexString(userId));
    creatorStatistics.allTimeBadgeMinters = auxMinters;
    creatorStatistics.allTimeBadgeMintersAmount = creatorStatistics.allTimeBadgeMintersAmount.plus(
      BigInt.fromI32(1)
    );
  }

  const mostPopularBadgeModel = findMostPopularCreatedBadgeId(creatorId);
  if (mostPopularBadgeModel) {
    creatorStatistics.createdBadgeIdMostPopular = mostPopularBadgeModel;
  }

  creatorStatistics.save();
}
