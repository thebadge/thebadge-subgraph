import { Address, BigInt, log } from "@graphprotocol/graph-ts";
import { LightGeneralizedTCR as LightGeneralizedTCRTemplate } from "../generated/templates";
import {
  ItemStatusChange,
  LightGeneralizedTCR,
} from "../generated/templates/LightGeneralizedTCR/LightGeneralizedTCR";
import {
  BadgeModelKlerosMetaData,
  Badge,
  BadgeKlerosMetaData,
  KlerosBadgeRequest,
  KlerosBadgeIdToBadgeId,
} from "../generated/schema";
import {
  KlerosBadgeChallenged,
  KlerosController,
  NewKlerosBadgeModel,
  mintKlerosBadge,
} from "../generated/KlerosController/KlerosController";
import { TheBadge } from "../generated/TheBadge/TheBadge";
import {
  STATUS_ABSENT,
  STATUS_CLEARING_REQUESTED,
  STATUS_REGISTERED,
  STATUS_REGISTRATION_REQUESTED,
  getArbitrationParamsIndex,
  getTCRRequestIndex,
} from "./tcrUtils";

// event NewKlerosBadgeModel(uint256 indexed badgeModelId, address indexed tcrAddress, string metadataUri)
export function handleNewKlerosBadgeModel(event: NewKlerosBadgeModel): void {
  const badgeModelId = event.params.badgeModelId;

  LightGeneralizedTCRTemplate.create(event.params.tcrAddress);
  const tcrList = LightGeneralizedTCR.bind(event.params.tcrAddress);

  const badgeModelKlerosMetaData = new BadgeModelKlerosMetaData(
    badgeModelId.toString()
  );
  badgeModelKlerosMetaData.badgeModelId = badgeModelId.toString();
  badgeModelKlerosMetaData.registrationUri = event.params.metadataUri;
  badgeModelKlerosMetaData.removalUri = "ipfs://TODO";
  badgeModelKlerosMetaData.tcrList = event.params.tcrAddress;
  badgeModelKlerosMetaData.submissionBaseDeposit = tcrList.submissionBaseDeposit();
  badgeModelKlerosMetaData.challengePeriodDuration = tcrList.challengePeriodDuration();
  badgeModelKlerosMetaData.save();
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
  const _badgeModelKlerosMetaData = BadgeModelKlerosMetaData.load(badgeModelId);

  if (!_badgeModelKlerosMetaData) {
    log.error("KlerosBadgeType not found. badgeId {} badgeModelId {}", [
      badgeId.toString(),
      badgeModelId,
    ]);
    return;
  }

  // BadgeKlerosMetaData
  const badgeKlerosMetaData = new BadgeKlerosMetaData(badgeId.toString());
  badgeKlerosMetaData.badge = badgeId.toString();
  const itemId = klerosController.klerosBadge(badgeId).getItemID();
  badgeKlerosMetaData.itemID = itemId;
  badgeKlerosMetaData.reviewDueDate = event.block.timestamp.plus(
    _badgeModelKlerosMetaData.challengePeriodDuration
  );
  badgeKlerosMetaData.save();

  // KlerosBadgeIdToBadgeId
  const klerosBadgeIdToBadgeId = new KlerosBadgeIdToBadgeId(
    itemId.toHexString()
  );
  klerosBadgeIdToBadgeId.badgeId = badgeId.toString();
  klerosBadgeIdToBadgeId.save();

  // request
  const requestIndex = getTCRRequestIndex(
    Address.fromBytes(_badgeModelKlerosMetaData.tcrList),
    badgeKlerosMetaData.itemID
  );
  const requestId = badgeId.toString() + "-" + requestIndex.toString();
  const request = new KlerosBadgeRequest(requestId);
  request.badgeKlerosMetaData = badgeId.toString();
  request.requestIndex = requestIndex;
  request.submissionTime = event.block.timestamp;
  request.arbitrationParamsIndex = getArbitrationParamsIndex(
    Address.fromBytes(_badgeModelKlerosMetaData.tcrList)
  );

  request.type = "Registration";
  request.requestBadgeEvidenceUri = event.params.evidence;
  //removeOrChallengeEvidenceUri: String;
  request.extraEvidenceUris = [];
  // request.challenger: Bytes;
  request.save();
}

// event ItemStatusChange(bytes32 indexed _itemID, bool _updatedDirectly);
export function handleItemStatusChange(event: ItemStatusChange): void {
  const klerosBadgeIdToBadgeId = KlerosBadgeIdToBadgeId.load(
    event.params._itemID.toHexString()
  );

  if (!klerosBadgeIdToBadgeId) {
    log.error("klerosBadgeIdToBadgeId not found for id {}", [
      event.params._itemID.toHexString(),
    ]);
    return;
  }

  const badge = Badge.load(klerosBadgeIdToBadgeId.badgeId);
  if (!badge) {
    log.error("badge not found for id {}", [klerosBadgeIdToBadgeId.badgeId]);
    return;
  }

  const tcrList = LightGeneralizedTCR.bind(event.address);
  const item = tcrList.items(event.params._itemID);

  if (BigInt.fromI32(item.getStatus()) == STATUS_ABSENT) {
    badge.status = "Absent";
  }

  if (BigInt.fromI32(item.getStatus()) == STATUS_REGISTRATION_REQUESTED) {
    badge.status = "Requested";
  }

  if (BigInt.fromI32(item.getStatus()) == STATUS_REGISTERED) {
    badge.status = "Approved";
  }

  if (BigInt.fromI32(item.getStatus()) == STATUS_CLEARING_REQUESTED) {
    badge.status = "RequestRemoval";
  }

  badge.save();
}

// event Dispute(IArbitrator indexed _arbitrator, uint indexed _disputeID, uint _metaEvidenceID, uint _evidenceGroupID);
export function handleDispute(event: ItemStatusChange): void {
  // TODO: handle evidence
  // TODO: handle dispute data

  const klerosBadgeIdToBadgeId = KlerosBadgeIdToBadgeId.load(
    event.params._itemID.toHexString()
  );

  if (!klerosBadgeIdToBadgeId) {
    log.error("klerosBadgeIdToBadgeId not found for id {}", [
      event.params._itemID.toHexString(),
    ]);
    return;
  }

  const badge = Badge.load(klerosBadgeIdToBadgeId.badgeId);
  if (!badge) {
    log.error("badge not found for id {}", [klerosBadgeIdToBadgeId.badgeId]);
    return;
  }

  badge.status = "Challenged";
  badge.save();
}
