import { BigInt } from "@graphprotocol/graph-ts";
import { User, UserStatistic } from "../../generated/schema";

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

  const userStatistics = new UserStatistic(id);
  userStatistics.mintedBadgesAmount = BigInt.fromI32(0);
  userStatistics.createdBadgesModelAmount = BigInt.fromI32(0);
  userStatistics.challengedBadgesAmount = BigInt.fromI32(0);
  userStatistics.user = user.id;
  userStatistics.save();

  user.statistics = userStatistics.id;
  user.save();
  return user;
}
