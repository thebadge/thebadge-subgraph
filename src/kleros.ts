import { Address, BigInt, log } from "@graphprotocol/graph-ts";
import { LightGeneralizedTCR as LightGeneralizedTCRTemplate } from "../generated/templates";
import { LightGeneralizedTCR } from "../generated/templates/LightGeneralizedTCR/LightGeneralizedTCR";
import { NewKlerosBadgeType } from "../generated/KlerosBadgeTypeController/KlerosBadgeTypeController";
import {
  KlerosBadgeType,
  Badge,
  KlerosBadge,
  KlerosBadgeRequest,
} from "../generated/schema";
import {
  RequestKlerosBadge,
  BadgeChallenged,
} from "../generated/KlerosBadgeTypeController/KlerosBadgeTypeController";
import { getArbitrationParamsIndex, getTCRRequestIndex } from "./tcrUtils";

// event NewKlerosBadgeType(uint256 indexed badgeId, address indexed klerosTCRAddress, string registrationMetadata)
export function handleNewKlerosBadgeType(event: NewKlerosBadgeType): void {
  const badgeId = event.params.badgeId;

  LightGeneralizedTCRTemplate.create(event.params.klerosTCRAddress);

  const tcrList = LightGeneralizedTCR.bind(event.params.klerosTCRAddress);

  const klerosBadgeType = new KlerosBadgeType(badgeId.toString());
  klerosBadgeType.badgeTypeId = badgeId.toString();
  klerosBadgeType.metadataURL = event.params.registrationMetadata;
  klerosBadgeType.tcrList = event.params.klerosTCRAddress;
  klerosBadgeType.submissionBaseDeposit = tcrList.submissionBaseDeposit();
  klerosBadgeType.challengePeriodDuration = tcrList.challengePeriodDuration();
  klerosBadgeType.save();
}

// event RequestKlerosBadge(address indexed callee, uint256 indexed badgeTypeId, bytes32 klerosItemID, address indexed to, string evidence)
export function handleRequestKlerosBadge(event: RequestKlerosBadge): void {
  const klerosBadgeType = KlerosBadgeType.load(
    event.params.badgeTypeId.toString()
  );

  if (!klerosBadgeType) {
    log.error("KlerosBadgeType not found {}", [
      event.params.badgeTypeId.toString(),
    ]);
    return;
  }

  //---------------
  //-- kleros badge
  //---------------

  const badgeId =
    event.params.to.toHexString() + "-" + event.params.badgeTypeId.toString();

  const klerosBadge = new KlerosBadge(badgeId);
  klerosBadge.badge = badgeId;
  klerosBadge.status = "RegistrationRequested";
  klerosBadge.itemID = event.params.klerosItemID;
  klerosBadge.reviewDueDate = event.block.timestamp.plus(
    klerosBadgeType.challengePeriodDuration
  );
  klerosBadge.isChallenged = false;

  // kleros badge request
  const requestId =
    badgeId +
    "-" +
    getTCRRequestIndex(
      Address.fromBytes(klerosBadgeType.tcrList),
      klerosBadge.itemID
    ).toString();

  const request = new KlerosBadgeRequest(requestId);
  request.arbitrationParamsIndex = getArbitrationParamsIndex(
    Address.fromBytes(klerosBadgeType.tcrList)
  );
  request.type = "Registration";
  request.submissionTime = event.block.timestamp;
  request.requester = event.params.callee;
  request.save();

  klerosBadge.requests.push(request.id);

  klerosBadge.save();
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

  // badge.isChallenged = true;
  badge.save();
}
