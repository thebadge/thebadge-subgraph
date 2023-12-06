import { KlerosBadgeRequest } from "../../../generated/schema";
import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import { DISPUTE_OUTCOME_NONE, getArbitrationParamsIndex } from "../tcrUtils";

export class KlerosBadgeRequestBuilder {
  private klerosBadgeRequest: KlerosBadgeRequest;

  constructor(
    requestID: string,
    type: string,
    createdAt: BigInt,
    badgeKlerosMetadata: string,
    requestIndex: BigInt,
    disputeID: BigInt,
    tcrListAddress: Address,
    requesterAddress: Bytes,
    arbitrator: Bytes,
    challengerAddress: Bytes | null = null
  ) {
    this.klerosBadgeRequest = new KlerosBadgeRequest(requestID);
    this.klerosBadgeRequest.type = type;
    this.klerosBadgeRequest.createdAt = createdAt;
    this.klerosBadgeRequest.badgeKlerosMetaData = badgeKlerosMetadata;
    this.klerosBadgeRequest.requestIndex = requestIndex;
    this.klerosBadgeRequest.arbitrationParamsIndex = getArbitrationParamsIndex(
      tcrListAddress
    );
    this.klerosBadgeRequest.requester = requesterAddress;
    this.klerosBadgeRequest.challenger = challengerAddress || null;
    this.klerosBadgeRequest.numberOfEvidences = BigInt.fromI32(1);
    this.klerosBadgeRequest.resolutionTime = BigInt.fromI32(0);
    this.klerosBadgeRequest.disputed = false;
    this.klerosBadgeRequest.resolved = false;
    this.klerosBadgeRequest.resolutionTx = null;
    this.klerosBadgeRequest.disputeID = disputeID;
    this.klerosBadgeRequest.disputeOutcome = DISPUTE_OUTCOME_NONE;
    this.klerosBadgeRequest.arbitrator = arbitrator;
    this.klerosBadgeRequest.save();
  }

  build(): KlerosBadgeRequest {
    return this.klerosBadgeRequest;
  }
}
