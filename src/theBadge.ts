import { BigInt, log } from "@graphprotocol/graph-ts";
import {
  TheBadge,
  CreatorRegistered,
  BadgeModelCreated,
  TransferSingle
} from "../generated/TheBadge/TheBadge";

import { BadgeModel, Badge } from "../generated/schema";
import { loadUserOrGetDefault } from "./utils";

// event CreatorRegistered(address indexed creator, string metadata);
export function handleCreatorRegistered(event: CreatorRegistered): void {
  const id = event.params.creator.toHexString();

  const user = loadUserOrGetDefault(id);
  user.isCreator = true;
  user.creatorUri = event.params.metadata;
  user.save();
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
  badgeModel.save();

  // user
  const user = loadUserOrGetDefault(badgeModel.creator);
  user.createdBadgesModelAmount = user.createdBadgesModelAmount.plus(
    BigInt.fromI32(1)
  );
  user.save();
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
  const badgeId = event.params.id.toString();
  const badge = new Badge(badgeId);
  badge.badgeModel = badgeModelID;
  badge.account = event.params.to.toHexString();
  badge.status = "Requested";
  badge.validUntil = _badge.getDueDate();
  badge.createdAt = event.block.timestamp;
  badge.createdTxHash = event.transaction.hash;
  badge.uri = theBadge.uri(event.params.id);
  badge.save();

  // user
  const userId = event.params.to.toHexString();
  const user = loadUserOrGetDefault(userId);
  user.mintedBadgesAmount = user.mintedBadgesAmount.plus(BigInt.fromI32(1));
  user.save();
}
