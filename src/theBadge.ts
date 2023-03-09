import { BigInt, log } from "@graphprotocol/graph-ts";
import {
  TheBadge,
  EmitterRegistered,
  BadgeTypeCreated,
  BadgeStatusUpdated,
} from "../generated/TheBadge/TheBadge";
import {
  NewKlerosBadgeType,
  RequestKlerosBadge,
  BadgeChallenged,
} from "../generated/KlerosBadgeTypeController/KlerosBadgeTypeController";
import { LightGeneralizedTCR } from "../generated/TheBadge/LightGeneralizedTCR";
// import { Arbitror } from "../generated/TheBadge/Arbitror";
import { User, BadgeType, KlerosBadgeType, Badge } from "../generated/schema";

function loadUserOrGetDefault(id: string): User {
  let user = User.load(id);
  if (user) {
    return user;
  }
  user = new User(id);
  user.mintedBadgesAmount = BigInt.fromI32(0);
  user.createdBadgesTypesAmount = BigInt.fromI32(0);
  user.isCreator = false;
  user.isVerified = false;
  return user;
}

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

// event NewKlerosBadgeType(uint256 indexed badgeId, address indexed klerosTCRAddress, string registrationMetadata)
export function handleNewKlerosBadgeType(event: NewKlerosBadgeType): void {
  const badgeId = event.params.badgeId;

  // const klerosBadgeTypeController = KlerosBadgeTypeController.bind(
  //   event.address
  // );
  const tcrList = LightGeneralizedTCR.bind(event.params.klerosTCRAddress);

  const klerosBadgeType = new KlerosBadgeType(badgeId.toString());
  klerosBadgeType.badgeType = badgeId.toString();
  klerosBadgeType.klerosMetadataURL = event.params.registrationMetadata;
  klerosBadgeType.klerosTCRList = event.params.klerosTCRAddress;
  klerosBadgeType.submissionBaseDeposit = tcrList.submissionBaseDeposit();
  klerosBadgeType.challengePeriodDuration = tcrList.challengePeriodDuration();
  klerosBadgeType.save();
}

// event RequestKlerosBadge(address indexed callee, uint256 indexed badgeTypeId, bytes32 klerosItemID, address indexed to, string evidence)
export function handleRequestKlerosBadge(event: RequestKlerosBadge): void {
  const userId = event.params.to.toHexString();
  const user = loadUserOrGetDefault(userId);
  user.mintedBadgesAmount = user.mintedBadgesAmount.plus(BigInt.fromI32(1));
  user.save();

  // TODO: hardcoded for kleros
  const klerosBadgeType = KlerosBadgeType.load(
    event.params.badgeTypeId.toString()
  );

  const badgeId =
    event.params.to.toHexString() + "-" + event.params.badgeTypeId.toString();
  const badge = new Badge(badgeId);
  badge.externalId = event.params.klerosItemID;
  badge.badgeType = event.params.badgeTypeId.toString();
  badge.evidenceMetadataUrl = event.params.evidence;
  badge.status = "InReview";
  badge.isChallenged = false;
  badge.receiver = userId;
  badge.requestedBy = event.params.callee;
  // TODO: hardcoded for kleros
  if (klerosBadgeType) {
    badge.reviewDueDate = event.block.timestamp.plus(
      klerosBadgeType.challengePeriodDuration
    );
  } else {
    badge.reviewDueDate = BigInt.fromI32(0);
  }

  badge.save();
}

// event BadgeStatusUpdated(uint256 indexed badgeId, address indexed badgeOwner, BadgeStatus status);
export function handleBadgeStatusUpdated(event: BadgeStatusUpdated): void {
  const badgeTypeId = event.params.badgeId.toString();
  const user = event.params.badgeOwner.toHexString();

  const badgeId = user + "-" + badgeTypeId;
  const badge = Badge.load(badgeId);

  if (badge == null) {
    log.error("Badge status update {}", [badgeId.toString()]);
    return;
  }

  if (BigInt.fromI32(event.params.status) == BigInt.fromI32(2)) {
    badge.status = "Approved";
  }
  if (BigInt.fromI32(event.params.status) == BigInt.fromI32(3)) {
    badge.status = "Rejected";
  }
  if (BigInt.fromI32(event.params.status) == BigInt.fromI32(4)) {
    badge.status = "Revoked";
  }

  badge.save();
}

// event BadgeChallenged(uint256 indexed badgeId, address indexed wallet, string evidence, address sender);
export function handleBadgeChallenged(event: BadgeChallenged): void {
  const badgeTypeId = event.params.badgeId.toString();
  const user = event.params.wallet.toHexString();

  const badgeId = user + "-" + badgeTypeId;
  const badge = Badge.load(badgeId);

  if (badge == null) {
    log.error("Badge status update {}", [badgeId]);
    return;
  }

  badge.isChallenged = true;
  badge.save();
}
