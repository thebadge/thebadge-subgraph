/* eslint-disable prefer-const */
import { BigInt } from "@graphprotocol/graph-ts";
import { NewGTCR } from "../generated/LightGTCRFactory/LightGTCRFactory";
import { LRegistry } from "../generated/schema";
import { LightGeneralizedTCR as LightGeneralizedTCRDataSource } from "../generated/templates";

export function handleNewGTCR(event: NewGTCR): void {
  LightGeneralizedTCRDataSource.create(event.params._address);

  let registry = new LRegistry(event.params._address.toHexString());

  registry.metaEvidenceCount = BigInt.fromI32(0);
  registry.numberOfAbsent = BigInt.fromI32(0);
  registry.numberOfRegistered = BigInt.fromI32(0);
  registry.numberOfRegistrationRequested = BigInt.fromI32(0);
  registry.numberOfClearingRequested = BigInt.fromI32(0);
  registry.numberOfChallengedRegistrations = BigInt.fromI32(0);
  registry.numberOfChallengedClearing = BigInt.fromI32(0);
  registry.save();
}
