/* eslint-disable prefer-const */
import { Bytes, log, BigInt } from "@graphprotocol/graph-ts";
import { Item, Request, Registry } from "../generated/schema";
import { AppealPossible } from "../generated/templates/IArbitrator/IArbitrator";
import { IArbitrator as IArbitratorDataSourceTemplate } from "../generated/templates";
import {
  Dispute,
  GeneralizedTCR,
  ItemStatusChange,
  RequestEvidenceGroupID,
  MetaEvidence as MetaEvidenceEvent
} from "../generated/templates/GeneralizedTCR/GeneralizedTCR";
import { Ruling } from "../generated/templates/IArbitrator/GeneralizedTCR";

// Items on a TCR can be in 1 of 4 states:
// - (0) Absent: The item is not registered on the TCR and there are no pending requests.
// - (1) Registered: The item is registered and there are no pending requests.
// - (2) Registration Requested: The item is not registered on the TCR, but there is a pending
//       registration request.
// - (3) Clearing Requested: The item is registered on the TCR, but there is a pending removal
//       request. These are sometimes also called removal requests.
//
// Registration and removal requests can be challenged. Once the request resolves (either by
// passing the challenge period or via dispute resolution), the item state is updated to 0 or 1.

let ABSENT = "Absent";
let REGISTERED = "Registered";
let REGISTRATION_REQUESTED = "RegistrationRequested";
let CLEARING_REQUESTED = "ClearingRequested";

let NONE = "None";
let ACCEPT = "Accept";
let REJECT = "Reject";

function getStatus(status: number): string {
  if (status == 0) return ABSENT;
  if (status == 1) return REGISTERED;
  if (status == 2) return REGISTRATION_REQUESTED;
  if (status == 3) return CLEARING_REQUESTED;
  return "Error";
}

function getFinalRuling(outcome: number): string {
  if (outcome == 0) return NONE;
  if (outcome == 1) return ACCEPT;
  if (outcome == 2) return REJECT;
  return "Error";
}

let ZERO_ADDRESS = Bytes.fromHexString(
  "0x0000000000000000000000000000000000000000"
) as Bytes;

export function handleRequestSubmitted(event: RequestEvidenceGroupID): void {
  let tcr = GeneralizedTCR.bind(event.address);
  let graphItemID =
    event.params._itemID.toHexString() + "@" + event.address.toHexString();
  let itemInfo = tcr.getItemInfo(event.params._itemID);
  let registry = Registry.load(event.address.toHexString());
  if (!registry) {
    log.error(`Registry at {} not found.`, [event.address.toHexString()]);
    return;
  }

  let item = Item.load(graphItemID);
  if (!item) {
    item = new Item(graphItemID);
    item.itemID = event.params._itemID;
    item.data = itemInfo.value0;
    item.numberOfRequests = BigInt.fromI32(1);
    item.registry = registry.id;
    item.disputed = false;
    registry.numberOfItems = registry.numberOfItems.plus(BigInt.fromI32(1));
  } else {
    item.numberOfRequests = item.numberOfRequests.plus(BigInt.fromI32(1));
  }
  item.status = getStatus(itemInfo.value1);
  item.latestRequester = event.transaction.from;
  item.latestChallenger = ZERO_ADDRESS;
  item.latestRequestResolutionTime = BigInt.fromI32(0);
  item.latestRequestSubmissionTime = event.block.timestamp;

  let requestID =
    graphItemID + "-" + itemInfo.value2.minus(BigInt.fromI32(1)).toString();

  let request = new Request(requestID);
  request.disputed = false;
  request.arbitrator = tcr.arbitrator();
  request.arbitratorExtraData = tcr.arbitratorExtraData();
  request.challenger = ZERO_ADDRESS;
  request.requester = event.transaction.from;
  request.item = item.id;
  request.registry = registry.id;
  request.resolutionTime = BigInt.fromI32(0);

  request.disputeOutcome = NONE;
  request.resolved = false;
  request.disputeID = BigInt.fromI32(0);
  request.submissionTime = event.block.timestamp;
  request.requestType = item.status;
  request.evidenceGroupID = event.params._evidenceGroupID;

  request.save();
  item.save();
}

export function handleRequestResolved(event: ItemStatusChange): void {
  if (event.params._resolved == false) return; // No-op.

  let graphItemID =
    event.params._itemID.toHexString() + "@" + event.address.toHexString();
  let tcrAddress = event.address.toHexString();

  let tcr = GeneralizedTCR.bind(event.address);
  let itemInfo = tcr.getItemInfo(event.params._itemID);

  let item = Item.load(graphItemID);
  if (item == null) {
    log.error("GTCR: Item {} @ {} not found. Bailing handleRequestResolved.", [
      event.params._itemID.toHexString(),
      tcrAddress
    ]);
    return;
  }

  item.status = getStatus(itemInfo.value1);
  item.latestRequestResolutionTime = event.block.timestamp;
  item.disputed = false;
  item.save();

  let requestInfo = tcr.getRequestInfo(
    event.params._itemID,
    event.params._requestIndex
  );

  let requestID = graphItemID + "-" + event.params._requestIndex.toString();
  let request = Request.load(requestID);
  if (!request) {
    log.error(`Request of requestID {} not found.`, [requestID]);
    return;
  }

  request.resolved = true;
  request.resolutionTime = event.block.timestamp;
  request.disputeOutcome = getFinalRuling(requestInfo.value6);

  request.save();
}

export function handleRequestChallenged(event: Dispute): void {
  let tcr = GeneralizedTCR.bind(event.address);
  let itemID = tcr.arbitratorDisputeIDToItem(
    event.params._arbitrator,
    event.params._disputeID
  );
  let graphItemID = itemID.toHexString() + "@" + event.address.toHexString();
  let item = Item.load(graphItemID);
  if (!item) {
    log.error(`Item of graphItemID {} not found`, [graphItemID]);
    return;
  }

  item.disputed = true;
  item.latestChallenger = event.transaction.from;

  let itemInfo = tcr.getItemInfo(itemID);
  let requestID =
    graphItemID + "-" + itemInfo.value2.minus(BigInt.fromI32(1)).toString();
  let request = Request.load(requestID);
  if (!request) {
    log.error(`Request of requestID {} not found.`, [requestID]);
    return;
  }

  request.disputed = true;
  request.challenger = event.transaction.from;
  request.disputeID = event.params._disputeID;

  request.save();
}

export function handleMetaEvidence(event: MetaEvidenceEvent): void {
  let registry = Registry.load(event.address.toHexString());
  if (!registry) {
    log.error(`Registry at {} not found`, [event.address.toHexString()]);
    return;
  }

  registry.metaEvidenceCount = registry.metaEvidenceCount.plus(
    BigInt.fromI32(1)
  );

  registry.save();
}

export function handleAppealPossible(event: AppealPossible): void {
  let registry = Registry.load(event.params._arbitrable.toHexString());
  if (registry == null) return; // Event not related to a GTCR.

  let tcr = GeneralizedTCR.bind(event.params._arbitrable);
  let itemID = tcr.arbitratorDisputeIDToItem(
    event.address,
    event.params._disputeID
  );
  let graphItemID =
    itemID.toHexString() + "@" + event.params._arbitrable.toHexString();
  let item = Item.load(graphItemID);
  if (!item) {
    log.error("Item of graphItemID {} not found.", [graphItemID]);
    return;
  }

  let requestID =
    item.id + "-" + item.numberOfRequests.minus(BigInt.fromI32(1)).toString();
  let request = Request.load(requestID);
  if (!request) {
    log.error(`Request of requestID {} not found.`, [requestID]);
    return;
  }

  item.save();
}

export function handleRuling(event: Ruling): void {
  let tcr = GeneralizedTCR.bind(event.address);
  let itemID = tcr.arbitratorDisputeIDToItem(
    event.address,
    event.params._disputeID
  );
  let graphItemID = itemID.toHexString() + "@" + event.address.toHexString();
  let item = Item.load(graphItemID);
  if (!item) {
    log.error("Item of graphItemID {} not found.", [graphItemID]);
    return;
  }

  let requestID =
    item.id + "-" + item.numberOfRequests.minus(BigInt.fromI32(1)).toString();
  let request = Request.load(requestID);
  if (!request) {
    log.error(`Request of requestID {} not found.`, [requestID]);
    return;
  }

  request.resolutionTime = event.block.timestamp;
  request.save();
}
