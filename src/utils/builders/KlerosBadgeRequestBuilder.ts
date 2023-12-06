import { KlerosBadgeRequest } from "../../../generated/schema";
import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import { DISPUTE_OUTCOME_NONE, getArbitrationParamsIndex } from "../tcrUtils";

export class KlerosBadgeRequestBuilder {
  private klerosBadgeRequest: KlerosBadgeRequest;

  constructor({
    requestID,
    requesterAddress,
    type,
    requestIndex,
    tcrListAddress,
    createdAt,
    arbitrator,
    badgeKlerosMetadata
  }: {
    requestID: string;
    type: string;
    createdAt: BigInt; // Replace YourEventType with the actual type of event
    badgeKlerosMetadata: string;
    requestIndex: BigInt;
    tcrListAddress: Address;
    requesterAddress: Bytes;
    arbitrator: Bytes;
  }) {
    this.klerosBadgeRequest = new KlerosBadgeRequest(requestID);
    this.klerosBadgeRequest.type = type;
    this.klerosBadgeRequest.createdAt = createdAt;
    this.klerosBadgeRequest.badgeKlerosMetaData = badgeKlerosMetadata;
    this.klerosBadgeRequest.requestIndex = requestIndex;
    this.klerosBadgeRequest.arbitrationParamsIndex = getArbitrationParamsIndex(
      tcrListAddress
    );
    this.klerosBadgeRequest.requester = requesterAddress;
    this.klerosBadgeRequest.numberOfEvidences = BigInt.fromI32(1);
    this.klerosBadgeRequest.disputed = false;
    this.klerosBadgeRequest.disputeOutcome = DISPUTE_OUTCOME_NONE;
    this.klerosBadgeRequest.resolved = false;
    this.klerosBadgeRequest.resolutionTime = BigInt.fromI32(0);
    this.klerosBadgeRequest.arbitrator = arbitrator;
    this.klerosBadgeRequest.save();
  }

  build(): KlerosBadgeRequest {
    return this.klerosBadgeRequest;
  }
}
