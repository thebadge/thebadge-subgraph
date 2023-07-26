import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import { LightGeneralizedTCR } from "../../generated/templates/LightGeneralizedTCR/LightGeneralizedTCR";

// DisputeOutcome "enum" (we cannot use enums in assemblyScript :@!)
export const DISPUTE_OUTCOME_NONE = "None";
export const DISPUTE_OUTCOME_ACCEPT = "Accept";
export const DISPUTE_OUTCOME_REJECT = "Reject";
//

// DisputeOutcome "enum" (we cannot use enums in assemblyScript x2 :@!!)
const TheBadgeBadgeStatus_Absent = "Absent";
const TheBadgeBadgeStatus_Requested = "Requested";
export const TheBadgeBadgeStatus_Challenged = "Challenged";
const TheBadgeBadgeStatus_Approved = "Approved";
const TheBadgeBadgeStatus_RemovalRequested = "RemovalRequested";
//

// DisputeOutcome "enum" (we cannot use enums in assemblyScript x3 :@!!!)
const TCRItemStatusCode_ABSENT_CODE = 0;
const TCRItemStatusCode_REGISTERED_CODE = 1;
const TCRItemStatusCode_REGISTRATION_REQUESTED_CODE = 2;
const TCRItemStatusCode_CLEARING_REQUESTED_CODE = 3;
//

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
  if (outcome == 0) return DISPUTE_OUTCOME_NONE;
  if (outcome == 1) return DISPUTE_OUTCOME_ACCEPT;
  if (outcome == 2) return DISPUTE_OUTCOME_REJECT;
  return "Error";
}

export function getTBStatus(status: number): string {
  if (status === TCRItemStatusCode_ABSENT_CODE) {
    return TheBadgeBadgeStatus_Absent;
  }
  if (status === TCRItemStatusCode_REGISTERED_CODE) {
    return TheBadgeBadgeStatus_Approved;
  }
  if (status === TCRItemStatusCode_REGISTRATION_REQUESTED_CODE) {
    return TheBadgeBadgeStatus_Requested;
  }
  if (status === TCRItemStatusCode_CLEARING_REQUESTED_CODE) {
    return TheBadgeBadgeStatus_RemovalRequested;
  }
  return "Error";
}
