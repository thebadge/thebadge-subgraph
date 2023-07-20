/* eslint-disable prefer-const */
import { BigInt } from "@graphprotocol/graph-ts";
import { NewGTCR } from "../generated/GTCRFactory/GTCRFactory";
import { Registry } from "../generated/schema";
import { GeneralizedTCR as GeneralizedTCRDataSource } from "../generated/templates";

export function handleNewGTCR(event: NewGTCR): void {
  GeneralizedTCRDataSource.create(event.params._address);

  let registry = new Registry(event.params._address.toHexString());
  registry.metaEvidenceCount = BigInt.fromI32(0);
  registry.numberOfItems = BigInt.fromI32(0);
  registry.save();
}
