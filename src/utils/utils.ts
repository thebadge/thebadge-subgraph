import { User } from "../../generated/schema";
import { BigInt } from "@graphprotocol/graph-ts";

export function loadUserOrGetDefault(id: string): User {
  let user = User.load(id);
  if (user) {
    return user;
  }

  user = new User(id);
  user.mintedBadgesAmount = BigInt.fromI32(0);
  user.isCreator = false;
  user.isCurator = false;
  user.isVerified = false;
  user.creatorUri = null;
  user.createdBadgesModelAmount = BigInt.fromI32(0);
  user.challengedBadgesAmount = BigInt.fromI32(0);
  return user;
}
