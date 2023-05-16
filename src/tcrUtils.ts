import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import { LightGeneralizedTCR } from "../generated/templates/LightGeneralizedTCR/LightGeneralizedTCR";

export const STATUS_ABSENT = BigInt.fromI32(0);
export const STATUS_REGISTERED = BigInt.fromI32(1);
export const STATUS_REGISTRATION_REQUESTED = BigInt.fromI32(2);
export const STATUS_CLEARING_REQUESTED = BigInt.fromI32(3);

export function getTCRRequestIndex(tcrAddress: Address, itemId: Bytes): BigInt {
  const tcrList = LightGeneralizedTCR.bind(tcrAddress);

  const items = tcrList.items(itemId);
  return items.getRequestCount().minus(BigInt.fromI32(1));
}

export function getArbitrationParamsIndex(tcrAddress: Address): BigInt {
  const tcrList = LightGeneralizedTCR.bind(tcrAddress);
  return BigInt.fromI32(tcrList.arbitrationParamsChanges.length - 1);
}
