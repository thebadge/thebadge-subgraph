import { Address, BigInt, log } from "@graphprotocol/graph-ts";
import { LightGeneralizedTCR as LightGeneralizedTCRTemplate } from "../generated/templates";
import {
  ItemStatusChange,
  LightGeneralizedTCR
} from "../generated/templates/LightGeneralizedTCR/LightGeneralizedTCR";
import {
  BadgeModelKlerosMetaData,
  Badge,
  BadgeKlerosMetaData,
  KlerosBadgeRequest,
  KlerosBadgeIdToBadgeId,
  KlerosBadgeEvidence
} from "../generated/schema";
import {
  KlerosController,
  NewKlerosBadgeModel,
  mintKlerosBadge
} from "../generated/KlerosController/KlerosController";
import { TheBadge } from "../generated/TheBadge/TheBadge";
import {
  STATUS_ABSENT,
  STATUS_CLEARING_REQUESTED,
  STATUS_REGISTERED,
  STATUS_REGISTRATION_REQUESTED,
  getArbitrationParamsIndex,
  getTCRRequestIndex, NONE
} from "./utils";
import { Dispute } from "../generated/KlerosController/LightGeneralizedTCR";

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
  const badgeIdBigInt = event.params.badgeId;
  const badgeId = badgeIdBigInt.toString();

  const badgeModelId = theBadge
    .badge(badgeIdBigInt)
    .getBadgeModelId()
    .toString();

  const _badgeModelKlerosMetaData = BadgeModelKlerosMetaData.load(badgeModelId);

  if (!_badgeModelKlerosMetaData) {
    log.error("KlerosBadgeType not found. badgeId {} badgeModelId {}", [
      badgeId,
      badgeModelId
    ]);
    return;
  }

  // BadgeKlerosMetaData
  const itemId = klerosController.klerosBadge(badgeIdBigInt).getItemID();

  const badgeKlerosMetaData = new BadgeKlerosMetaData(badgeId);
  badgeKlerosMetaData.badge = badgeId;
  badgeKlerosMetaData.itemID = itemId;
  badgeKlerosMetaData.reviewDueDate = event.block.timestamp.plus(
    _badgeModelKlerosMetaData.challengePeriodDuration
  );
  badgeKlerosMetaData.numberOfRequests = BigInt.fromI32(0);
  badgeKlerosMetaData.save();

  // KlerosBadgeIdToBadgeId
  const klerosBadgeIdToBadgeId = new KlerosBadgeIdToBadgeId(
    itemId.toHexString()
  );
  klerosBadgeIdToBadgeId.badgeId = badgeId;
  klerosBadgeIdToBadgeId.save();

  // request
  const requestIndex = getTCRRequestIndex(
    Address.fromBytes(_badgeModelKlerosMetaData.tcrList),
    badgeKlerosMetaData.itemID
  );

  const requestId = itemId.toHexString() + "-" + requestIndex.toString();
  const request = new KlerosBadgeRequest(requestId);
  const tcrListAddress = Address.fromBytes(_badgeModelKlerosMetaData.tcrList);
  request.type = "Registration";
  request.createdAt = event.block.timestamp;
  request.badgeKlerosMetaData = badgeId;
  request.requestIndex = requestIndex;
  request.arbitrationParamsIndex = getArbitrationParamsIndex(tcrListAddress);
  request.requester = klerosController.klerosBadge(badgeIdBigInt).getCallee();
  request.numberOfEvidences = BigInt.fromI32(1);
  request.disputed = false;
  request.disputeOutcome = NONE;
  request.resolved = false;
  request.resolutionTime = BigInt.fromI32(0);

  // todo remove
  // Both request.disputeId and request.challenger are left null as this is the first time when the badge is created.
  //  request.disputeId = 1

  //  klerosController.klerosBadge(badgeId).request.disputeId = 1;
  //request.challenger = 1;*/

  let evidence = new KlerosBadgeEvidence(request.id + "-" + "0");
  evidence.URI = event.params.evidence;
  evidence.timestamp = event.block.timestamp;
  evidence.save();
  request.evidences = [evidence.id];
  request.save();
}

// event ItemStatusChange(bytes32 indexed _itemID, bool _updatedDirectly);
export function handleItemStatusChange(event: ItemStatusChange): void {
  const klerosBadgeIdToBadgeId = KlerosBadgeIdToBadgeId.load(
    event.params._itemID.toHexString()
  );

  if (!klerosBadgeIdToBadgeId) {
    log.error("klerosBadgeIdToBadgeId not found for id {}", [
      event.params._itemID.toHexString()
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
export function handleDispute(event: Dispute): void {
  // TODO: handle evidence
  // TODO: handle dispute data
  log.info("Init Handle dispute", []);

  // @todo (agustin) fix
  // const klerosBadgeIdToBadgeId = KlerosBadgeIdToBadgeId.load(
  //   event.params._itemID.toString()
  // );

  //
  // log.info("Init Handle dispute 2",[])
  // if (!klerosBadgeIdToBadgeId) {
  //   log.error("klerosBadgeIdToBadgeId not found for id {}", [
  //     event.params._itemID.toHexString(),
  //   ]);
  //   return;
  // }
  //
  // log.info("Init Handle dispute 3",[])
  // const badge = Badge.load(klerosBadgeIdToBadgeId.badgeId);
  // log.info("Init Handle dispute 4",[])
  // if (!badge) {
  //   log.error("badge not found for id {}", [klerosBadgeIdToBadgeId.badgeId]);
  //   return;
  // }
  //
  // log.info("Finish Handle dispute",[])
  // badge.status = "Challenged";
  // badge.save();
  // log.info("Init Handle dispute saved", [])
}
