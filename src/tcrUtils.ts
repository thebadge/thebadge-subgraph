import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import { LightGeneralizedTCR } from "../generated/templates/LightGeneralizedTCR/LightGeneralizedTCR";

export function getTCRRequestIndex(tcrAddress: Address, itemId: Bytes): BigInt {
  const tcrList = LightGeneralizedTCR.bind(tcrAddress);

  const items = tcrList.items(itemId);
  return items.getRequestCount().minus(BigInt.fromI32(1));
}

export function getArbitrationParamsIndex(tcrAddress: Address): BigInt {
  const tcrList = LightGeneralizedTCR.bind(tcrAddress);
  return BigInt.fromI32(tcrList.arbitrationParamsChanges.length - 1);
}
