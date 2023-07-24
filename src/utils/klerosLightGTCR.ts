import { Address, BigInt, Bytes, log } from "@graphprotocol/graph-ts";
import { LRegistry } from "../../generated/schema";

let ABSENT = "Absent";
let REGISTERED = "Registered";
let REGISTRATION_REQUESTED = "RegistrationRequested";
let CLEARING_REQUESTED = "ClearingRequested";

let NONE = "None";
let ABSENT_CODE = 0;
let REGISTERED_CODE = 1;
let REGISTRATION_REQUESTED_CODE = 2;
let CLEARING_REQUESTED_CODE = 3;
let CHALLENGED_REGISTRATION_REQUEST_CODE = 4;
let CHALLENGED_CLEARING_REQUEST_CODE = 5;

let CONTRACT_STATUS_EXTENDED = new Map<string, number>();
CONTRACT_STATUS_EXTENDED.set(ABSENT, ABSENT_CODE);
CONTRACT_STATUS_EXTENDED.set(REGISTERED, REGISTERED_CODE);
CONTRACT_STATUS_EXTENDED.set(
  REGISTRATION_REQUESTED,
  REGISTRATION_REQUESTED_CODE
);
CONTRACT_STATUS_EXTENDED.set(CLEARING_REQUESTED, CLEARING_REQUESTED_CODE);

let CONTRACT_STATUS_NAMES = new Map<number, string>();
CONTRACT_STATUS_NAMES.set(ABSENT_CODE, "Absent");
CONTRACT_STATUS_NAMES.set(REGISTERED_CODE, "Registered");
CONTRACT_STATUS_NAMES.set(REGISTRATION_REQUESTED_CODE, "RegistrationRequested");
CONTRACT_STATUS_NAMES.set(CLEARING_REQUESTED_CODE, "ClearingRequested");

let ZERO_ADDRESS = Bytes.fromHexString(
  "0x0000000000000000000000000000000000000000"
) as Bytes;

/**
 * Decrements and increments registry counters based on item status change.
 *
 * The user should ensure that this function is called once and only once for
 * each status update. What handlers were called before and which will be called
 * after the one this is being called on? Do they call updateCounters?
 * @param previousStatus The previous extended status of the item.
 * @param newStatus The new extended status of the item.
 * @param registryAddress
 */
function updateCounters(
  previousStatus: number,
  newStatus: number,
  registryAddress: Address
): void {
  let registry = LRegistry.load(registryAddress.toHexString());
  if (!registry) {
    log.error(`LRegistry at {} not found.`, [registryAddress.toHexString()]);
    return;
  }

  if (previousStatus == ABSENT_CODE) {
    registry.numberOfAbsent = registry.numberOfAbsent.minus(BigInt.fromI32(1));
  } else if (previousStatus == REGISTERED_CODE) {
    registry.numberOfRegistered = registry.numberOfRegistered.minus(
      BigInt.fromI32(1)
    );
  } else if (previousStatus == REGISTRATION_REQUESTED_CODE) {
    registry.numberOfRegistrationRequested = registry.numberOfRegistrationRequested.minus(
      BigInt.fromI32(1)
    );
  } else if (previousStatus == CLEARING_REQUESTED_CODE) {
    registry.numberOfClearingRequested = registry.numberOfClearingRequested.minus(
      BigInt.fromI32(1)
    );
  } else if (previousStatus == CHALLENGED_REGISTRATION_REQUEST_CODE) {
    registry.numberOfChallengedRegistrations = registry.numberOfChallengedRegistrations.minus(
      BigInt.fromI32(1)
    );
  } else if (previousStatus == CHALLENGED_CLEARING_REQUEST_CODE) {
    registry.numberOfChallengedClearing = registry.numberOfChallengedClearing.minus(
      BigInt.fromI32(1)
    );
  }

  if (newStatus == ABSENT_CODE) {
    registry.numberOfAbsent = registry.numberOfAbsent.plus(BigInt.fromI32(1));
  } else if (newStatus == REGISTERED_CODE) {
    registry.numberOfRegistered = registry.numberOfRegistered.plus(
      BigInt.fromI32(1)
    );
  } else if (newStatus == REGISTRATION_REQUESTED_CODE) {
    registry.numberOfRegistrationRequested = registry.numberOfRegistrationRequested.plus(
      BigInt.fromI32(1)
    );
  } else if (newStatus == CLEARING_REQUESTED_CODE) {
    registry.numberOfClearingRequested = registry.numberOfClearingRequested.plus(
      BigInt.fromI32(1)
    );
  } else if (newStatus == CHALLENGED_REGISTRATION_REQUEST_CODE) {
    registry.numberOfChallengedRegistrations = registry.numberOfChallengedRegistrations.plus(
      BigInt.fromI32(1)
    );
  } else if (newStatus == CHALLENGED_CLEARING_REQUEST_CODE) {
    registry.numberOfChallengedClearing = registry.numberOfChallengedClearing.plus(
      BigInt.fromI32(1)
    );
  }

  registry.save();
}

function getExtendedStatus(disputed: boolean, status: string): number {
  if (disputed) {
    if (status == CONTRACT_STATUS_NAMES.get(REGISTRATION_REQUESTED_CODE))
      return CHALLENGED_REGISTRATION_REQUEST_CODE;
    else return CHALLENGED_CLEARING_REQUEST_CODE;
  }

  return CONTRACT_STATUS_EXTENDED.get(status);
}

function getStatus(status: number): string {
  if (status == ABSENT_CODE) return ABSENT;
  if (status == REGISTERED_CODE) return REGISTERED;
  if (status == REGISTRATION_REQUESTED_CODE) return REGISTRATION_REQUESTED;
  if (status == CLEARING_REQUESTED_CODE) return CLEARING_REQUESTED;
  return "Error";
}

export {
  updateCounters,
  getExtendedStatus,
  getStatus,
  REGISTRATION_REQUESTED,
  NONE,
  ZERO_ADDRESS
};
