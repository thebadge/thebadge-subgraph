import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import { LightGeneralizedTCR } from "../../generated/templates/LightGeneralizedTCR/LightGeneralizedTCR";

export const STATUS_ABSENT = BigInt.fromI32(0);
export const STATUS_REGISTERED = BigInt.fromI32(1);
export const STATUS_REGISTRATION_REQUESTED = BigInt.fromI32(2);
export const STATUS_CLEARING_REQUESTED = BigInt.fromI32(3);
export const NONE = "None";
export const ACCEPT = "Accept";
export const REJECT = "Reject";
export const REGISTRATION_REQUESTED_CODE = 2;
export const CLEARING_REQUESTED_CODE = 3;

export function getTCRRequestIndex(tcrAddress: Address, itemId: Bytes): BigInt {
  const tcrList = LightGeneralizedTCR.bind(tcrAddress);

  const items = tcrList.items(itemId);
  return items.getRequestCount().minus(BigInt.fromI32(1));
}

export function getArbitrationParamsIndex(tcrAddress: Address): BigInt {
  const tcrList = LightGeneralizedTCR.bind(tcrAddress);
  return BigInt.fromI32(tcrList.arbitrationParamsChanges.length - 1);
}

export function getFinalRuling(outcome: number): string {
  if (outcome == 0) return NONE;
  if (outcome == 1) return ACCEPT;
  if (outcome == 2) return REJECT;
  return "Error";
}
