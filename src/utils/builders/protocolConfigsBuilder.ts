import { ProtocolConfig } from "../../../generated/schema";
import { BigInt, Bytes } from "@graphprotocol/graph-ts";

export class ProtocolConfigsBuilder {
  private protocolConfigs: ProtocolConfig;

  constructor(contractAddress: string, statisticId: string, admin: Bytes) {
    this.protocolConfigs = new ProtocolConfig(contractAddress);
    this.protocolConfigs.protocolStatistics = statisticId;
    this.protocolConfigs.contractAdmin = admin;
    this.protocolConfigs.registerUserProtocolFee = new BigInt(0);
    this.protocolConfigs.createBadgeModelProtocolFee = new BigInt(0);
    this.protocolConfigs.mintBadgeProtocolDefaultFeeInBps = new BigInt(0);
    this.protocolConfigs.claimBadgeProtocolFee = new BigInt(0);
  }

  // You can add methods for optional parameters or additional configurations here

  build(): ProtocolConfig {
    return this.protocolConfigs;
  }
}
