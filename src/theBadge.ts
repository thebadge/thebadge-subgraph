import { Bytes, BigInt } from "@graphprotocol/graph-ts";
import {
  TheBadge,
  EmitterRegistered,
  BadgeTypeCreated,
} from "../generated/TheBadge/TheBadge";
import {
  KlerosBadgeTypeController,
  NewKlerosStrategy,
} from "../generated/KlerosBadgeTypeController/KlerosBadgeTypeController";
import { LightGeneralizedTCR } from "../generated/TheBadge/LightGeneralizedTCR";
import { Arbitror } from "../generated/TheBadge/Arbitror";
import { Emitter, BadgeType, KlerosBadgeType } from "../generated/schema";

// event EmitterRegistered(address indexed emitter, address indexed registrant, string metadata);
export function handleEmitterRegistered(event: EmitterRegistered): void {
  const emitter = new Emitter(
    Bytes.fromHexString(event.params.emitter.toHexString())
  );
  // emitter.isVerified = false;
  emitter.metadata = event.params.metadata;
  emitter.creator = event.params.registrant;
  emitter.save();
}

// event BadgeTypeCreated(address creator, uint256 badgeId, string metadata);
export function handleBadgeTypeCreated(event: BadgeTypeCreated): void {
  const badgeId = event.params.badgeId;

  const theBadge = TheBadge.bind(event.address);
  const badgeTypeInContract = theBadge.badgeType(badgeId);

  const badgeType = new BadgeType(badgeId.toString());
  badgeType.paused = false;
  badgeType.metadataURL = theBadge.uri(badgeId);
  badgeType.controllerName = badgeTypeInContract.getControllerName();
  badgeType.mintCost = badgeTypeInContract.getMintCost();
  badgeType.mintFee = badgeTypeInContract.getMintCost();
  badgeType.validFor = badgeTypeInContract.getValidFor();
  badgeType.emitter = badgeTypeInContract.getEmitter();

  badgeType.save();
}

// event NewKlerosBadgeType(uint256 indexed strategyId, address indexed klerosTCRAddress, string registrationMetadata);
export function handleNewKlerosBadgeType(event: NewKlerosStrategy): void {
  const badgeId = event.params.strategyId;

  // const klerosBadgeTypeController = KlerosBadgeTypeController.bind(
  //   event.address
  // );
  //const theBadge = TheBadge.bind(klerosBadgeTypeController.theBadge());
  const tcrList = LightGeneralizedTCR.bind(event.params.klerosTCRAddress);
  // const arbitror = Arbitror.bind(tcrList.arbitrator());

  const klerosBadgeType = new KlerosBadgeType(badgeId.toString());
  klerosBadgeType.badgeType = badgeId.toString();
  klerosBadgeType.klerosMetadataURL = event.params.registrationMetadata;
  klerosBadgeType.klerosTCRList = event.params.klerosTCRAddress;
  klerosBadgeType.badgesMintedAmount = BigInt.fromI32(0);
  klerosBadgeType.submissionBaseDeposit = tcrList.submissionBaseDeposit();
  klerosBadgeType.challengePeriodDuration = tcrList.challengePeriodDuration();
  klerosBadgeType.save();
}

// export function handleMintKlerosBadge(event: MintKlerosBadge): void {
//   const userId = Bytes.fromHexString(event.params.to.toHexString());
//   const badgeId =
//     event.params.badgeTypeId.toString() + "-" + event.params.to.toHexString();

//   const badge = new Badge(badgeId);
//   badge.badgeType = event.params.badgeTypeId.toString();
//   badge.evidenceMetadataUrl = event.params.evidence;
//   badge.status = "InReview";
//   badge.user = userId;
//   badge.save();

//   let user = User.load(userId);
//   if (user == null) {
//     user = new User(userId);
//     user.badges = new Array<string>();
//     user.mintedBadges = new BigInt(0);
//   }
//   const badges = user.badges;
//   badges.push(badgeId);
//   user.badges = badges;
//   user.mintedBadges = user.mintedBadges.plus(BigInt.fromI32(1));
//   user.save();
// }

// export function handleEmitterUpdatedByAdmin(
//   event: EmitterUpdatedByAdmin
// ): void {}
