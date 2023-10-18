import { BigInt, Bytes, log } from "@graphprotocol/graph-ts";
import {
  BadgeModel,
  CreatorStatistic,
  CuratorStatistic,
  ProtocolStatistic,
  User,
  UserStatistic
} from "../../generated/schema";
import {
  DISPUTE_OUTCOME_ACCEPT,
  DISPUTE_OUTCOME_NONE,
  DISPUTE_OUTCOME_REJECT,
  getFinalRuling
} from "./tcrUtils";

export function loadUserOrGetDefault(id: string): User {
  let user = User.load(id);

  if (user) {
    return user;
  }

  user = new User(id);
  user.metadataUri = null;
  user.isCompany = false;
  user.isCreator = false;
  user.suspended = false;
  user.isCurator = false;
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
    userStatistics.challengesReceivedRejectedAmount = BigInt.fromI32(0);
    userStatistics.mintedBadgesAmount = BigInt.fromI32(0);

    userStatistics.user = userAddress;
    userStatistics.save();
  }
  return userStatistics;
}

export function initializeProtocolStatistics(
  contractAddress: string
): ProtocolStatistic {
  let statistic = ProtocolStatistic.load(contractAddress);

  if (statistic) {
    return statistic;
  }

  statistic = new ProtocolStatistic(contractAddress);
  statistic.badgeModelsCreatedAmount = BigInt.fromI32(0);
  statistic.badgesMintedAmount = BigInt.fromI32(0);
  statistic.badgesChallengedAmount = BigInt.fromI32(0);
  statistic.badgesOwnersAmount = BigInt.fromI32(0);
  statistic.badgeCreatorsAmount = BigInt.fromI32(0);
  statistic.badgeCuratorsAmount = BigInt.fromI32(0);
  statistic.protocolEarnedFees = BigInt.fromI32(0);
  statistic.totalCreatorsFees = BigInt.fromI32(0);
  statistic.registeredUsersAmount = BigInt.fromI32(0);
  statistic.badgeCurators = [];
  statistic.badgeCreators = [];
  statistic.registeredUsers = [];
  statistic.save();
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
  creatorStatistics.createdBadgeModelsAmount = BigInt.fromI32(0);
  creatorStatistics.createdBadgeModelsMintedAmount = BigInt.fromI32(0);
  creatorStatistics.allTimeBadgeMinters = [];
  creatorStatistics.allTimeBadgeMintersAmount = BigInt.fromI32(0);
  creatorStatistics.mostPopularCreatedBadge = BigInt.fromI32(0);
  creatorStatistics.totalFeesEarned = BigInt.fromI32(0);

  creatorStatistics.save();
  return creatorStatistics;
}

export function loadUserCuratorStatisticsOrGetDefault(
  userAddress: string
): CuratorStatistic {
  let curatorStatistics = CuratorStatistic.load(userAddress);

  if (curatorStatistics) {
    return curatorStatistics;
  }

  curatorStatistics = new CuratorStatistic(userAddress);
  curatorStatistics.userStatistic = userAddress;
  curatorStatistics.challengesMadeAmount = BigInt.fromI32(0);
  curatorStatistics.challengesMadeLostAmount = BigInt.fromI32(0);
  curatorStatistics.challengesMadeWonAmount = BigInt.fromI32(0);
  curatorStatistics.challengesMadeRejectedAmount = BigInt.fromI32(0);
  curatorStatistics.save();
  return curatorStatistics;
}

export function updateUsersChallengesStatistics(
  userAddress: string,
  challengerAddress: string | null,
  ruling: number
): void {
  const disputeOutcome = getFinalRuling(ruling);
  const userStatistics = loadUserStatisticsOrGetDefault(userAddress);
  if (disputeOutcome == DISPUTE_OUTCOME_ACCEPT) {
    userStatistics.challengesReceivedLostAmount = userStatistics.challengesReceivedLostAmount.plus(
      BigInt.fromI32(1)
    );
    userStatistics.timeOfLastChallengeReceived = BigInt.fromI32(0);
  }
  if (disputeOutcome == DISPUTE_OUTCOME_REJECT) {
    userStatistics.challengesReceivedWonAmount = userStatistics.challengesReceivedWonAmount.plus(
      BigInt.fromI32(1)
    );
    userStatistics.timeOfLastChallengeReceived = BigInt.fromI32(0);
  }
  if (disputeOutcome == DISPUTE_OUTCOME_NONE) {
    userStatistics.challengesReceivedRejectedAmount = userStatistics.challengesReceivedRejectedAmount.plus(
      BigInt.fromI32(1)
    );
    userStatistics.timeOfLastChallengeReceived = BigInt.fromI32(0);
  }
  userStatistics.save();

  // Updates curator statistics
  if (!challengerAddress) {
    return;
  }
  const curatorStatistics = loadUserCuratorStatisticsOrGetDefault(
    challengerAddress as string
  );
  if (disputeOutcome == DISPUTE_OUTCOME_ACCEPT) {
    curatorStatistics.challengesMadeWonAmount = curatorStatistics.challengesMadeWonAmount.plus(
      BigInt.fromI32(1)
    );
  }
  if (disputeOutcome == DISPUTE_OUTCOME_REJECT) {
    curatorStatistics.challengesMadeLostAmount = curatorStatistics.challengesMadeLostAmount.plus(
      BigInt.fromI32(1)
    );
  }
  if (disputeOutcome == DISPUTE_OUTCOME_NONE) {
    curatorStatistics.challengesMadeRejectedAmount = curatorStatistics.challengesMadeRejectedAmount.plus(
      BigInt.fromI32(1)
    );
  }
  curatorStatistics.save();
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
  const statistic = ProtocolStatistic.load(protocolStatisticsId);
  if (!statistic) {
    log.error(
      "handleMintStatisticsUpdate - ProtocolStatistic not found for contractAddress {}",
      [protocolStatisticsId]
    );
    return;
  }

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
  creatorStatistics.createdBadgeModelsMintedAmount = creatorStatistics.createdBadgeModelsMintedAmount.plus(
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
    creatorStatistics.mostPopularCreatedBadge = mostPopularBadgeModel;
  }

  creatorStatistics.save();
}
