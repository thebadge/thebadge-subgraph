import { Address, log } from "@graphprotocol/graph-ts";
import { LightGeneralizedTCR as LightGeneralizedTCRTemplate } from "../generated/templates";
import { LightGeneralizedTCR } from "../generated/templates/LightGeneralizedTCR/LightGeneralizedTCR";
import {
  BadgeModelKlerosMetadata,
  Badge,
  BadgeKlerosMetadata,
  KlerosBadgeRequest,
} from "../generated/schema";
import {
  KlerosBadgeChallenged,
  KlerosController,
  NewKlerosBadgeModel,
  mintKlerosBadge,
} from "../generated/KlerosController/KlerosController";
import { TheBadge } from "../generated/TheBadge/TheBadge";
import { getArbitrationParamsIndex, getTCRRequestIndex } from "./tcrUtils";

// event NewKlerosBadgeModel(uint256 indexed badgeModelId, address indexed tcrAddress, string metadataUri)
export function handleNewKlerosBadgeModel(event: NewKlerosBadgeModel): void {
  const badgeModelId = event.params.badgeModelId;

  LightGeneralizedTCRTemplate.create(event.params.tcrAddress);
  const tcrList = LightGeneralizedTCR.bind(event.params.tcrAddress);

  const badgeModelKlerosMetadata = new BadgeModelKlerosMetadata(
    badgeModelId.toString()
  );
  badgeModelKlerosMetadata.badgeModelId = badgeModelId.toString();
  badgeModelKlerosMetadata.registrationUri = event.params.metadataUri;
  badgeModelKlerosMetadata.removalUri = "ipfs://TODO";
  badgeModelKlerosMetadata.tcrList = event.params.tcrAddress;
  badgeModelKlerosMetadata.submissionBaseDeposit = tcrList.submissionBaseDeposit();
  badgeModelKlerosMetadata.challengePeriodDuration = tcrList.challengePeriodDuration();
  badgeModelKlerosMetadata.save();
}

// event MintKlerosBadge(uint256 indexed badgeId, string evidence);
export function handleMintKlerosBadge(event: mintKlerosBadge): void {
  const klerosController = KlerosController.bind(event.address);
  const theBadge = TheBadge.bind(klerosController.theBadge());

  const badgeId = event.params.badgeId;

  const badgeModelId = theBadge
    .badge(badgeId)
    .getBadgeModelId()
    .toString();
  const _badgeModelKlerosMetadata = BadgeModelKlerosMetadata.load(badgeModelId);

  if (!_badgeModelKlerosMetadata) {
    log.error("KlerosBadgeType not found. badgeId {} badgeModelId {}", [
      badgeId.toString(),
      badgeModelId,
    ]);
    return;
  }

  // badgeKlerosMetadata
  const badgeKlerosMetadata = new BadgeKlerosMetadata(badgeId.toString());
  badgeKlerosMetadata.badge = badgeId.toString();
  badgeKlerosMetadata.itemID = klerosController
    .klerosBadge(badgeId)
    .getItemID();
  badgeKlerosMetadata.reviewDueDate = event.block.timestamp.plus(
    _badgeModelKlerosMetadata.challengePeriodDuration
  );
  badgeKlerosMetadata.save();

  // request
  const requestIndex = getTCRRequestIndex(
    Address.fromBytes(_badgeModelKlerosMetadata.tcrList),
    badgeKlerosMetadata.itemID
  );
  const requestId = badgeId.toString() + "-" + requestIndex.toString();
  const request = new KlerosBadgeRequest(requestId);
  request.badgeKlerosMetadata = badgeId.toString();
  request.requestIndex = requestIndex;
  request.arbitrationParamsIndex = getArbitrationParamsIndex(
    Address.fromBytes(_badgeModelKlerosMetadata.tcrList)
  );
  request.type = "Registration";
  request.submissionTime = event.block.timestamp;
  request.requester = theBadge.badge(badgeId).getAccount();
  request.save();
}

// event KlerosBadgeChallenged(uint256 indexed badgeId, address indexed wallet, string evidence, address sender);
// export function handleKlerosBadgeChallenged(
//   event: KlerosBadgeChallenged
// ): void {
//   const badgeTypeId = event.params.badgeId.toString();
//   const user = event.params.wallet.toHexString();

//   const badgeId = user + "-" + badgeTypeId;
//   const badge = Badge.load(badgeId);

//   if (badge == null) {
//     log.error("Badge status update {}", [badgeId]);
//     return;
//   }

//   // badge.isChallenged = true;
//   badge.save();
// }
