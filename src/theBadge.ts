import { BigInt } from "@graphprotocol/graph-ts";
import {
  TheBadge,
  EmitterRegistered,
  BadgeTypeCreated,
  BadgeRequested,
} from "../generated/TheBadge/TheBadge";

// import { Arbitror } from "../generated/TheBadge/Arbitror";
import { BadgeType, Badge } from "../generated/schema";
import { loadUserOrGetDefault } from "./utils";

// event EmitterRegistered(address indexed emitter, address indexed registrant, string metadata);
export function handleEmitterRegistered(event: EmitterRegistered): void {
  const id = event.params.emitter.toHexString();

  const user = loadUserOrGetDefault(id);
  user.isCreator = true;
  user.creatorMetadata = event.params.metadata;
  user.save();
}

// event BadgeTypeCreated(address creator, uint256 badgeId, string metadata, uint256 validFor);
export function handleBadgeTypeCreated(event: BadgeTypeCreated): void {
  const badgeId = event.params.badgeId;
  const theBadge = TheBadge.bind(event.address);
  const badgeTypeInContract = theBadge.badgeType(badgeId);
  const badgeType = new BadgeType(badgeId.toString());

  badgeType.paused = false;
  badgeType.metadataURL = theBadge.uri(badgeId);
  badgeType.controllerName = badgeTypeInContract.getControllerName();
  badgeType.mintCost = badgeTypeInContract.getMintCost();
  badgeType.validFor = badgeTypeInContract.getValidFor();
  badgeType.creator = badgeTypeInContract.getEmitter().toHexString();
  badgeType.badgesMintedAmount = BigInt.fromI32(0);
  badgeType.save();

  const user = loadUserOrGetDefault(badgeType.creator);
  user.createdBadgesTypesAmount = user.createdBadgesTypesAmount.plus(
    BigInt.fromI32(1)
  );
  user.save();
}

// event BadgeRequested(uint256 indexed badgeId,address indexed account,address registrant,BadgeStatus status,uint256 validFor);
export function handleRequestBadge(event: BadgeRequested): void {
  const userId = event.params.account.toHexString();
  const user = loadUserOrGetDefault(userId);
  user.mintedBadgesAmount = user.mintedBadgesAmount.plus(BigInt.fromI32(1));
  user.save();

  const badgeId =
    event.params.account.toHexString() + "-" + event.params.badgeId.toString();
  const badge = new Badge(badgeId);
  badge.badgeType = event.params.badgeId.toString();
  badge.receiver = userId;
  badge.requestedBy = event.params.registrant;
  badge.validFor = event.params.validFor.equals(BigInt.fromI32(0))
    ? BigInt.fromI32(0)
    : event.block.timestamp.plus(event.params.validFor);

  badge.save();
}

// event BadgeStatusUpdated(uint256 indexed badgeId, address indexed badgeOwner, BadgeStatus status);
// TODO: remove or move to specific controller
// export function handleBadgeStatusUpdated(event: BadgeStatusUpdated): void {
//   const badgeTypeId = event.params.badgeId.toString();
//   const user = event.params.badgeOwner.toHexString();

//   const badgeId = user + "-" + badgeTypeId;
//   const badge = Badge.load(badgeId);

//   if (badge == null) {
//     log.error("Badge status update {}", [badgeId.toString()]);
//     return;
//   }

//   if (BigInt.fromI32(event.params.status) == BigInt.fromI32(2)) {
//     badge.status = "Approved";
//   }
//   if (BigInt.fromI32(event.params.status) == BigInt.fromI32(3)) {
//     badge.status = "Rejected";
//   }
//   if (BigInt.fromI32(event.params.status) == BigInt.fromI32(4)) {
//     badge.status = "Revoked";
//   }

//   badge.save();
// }
