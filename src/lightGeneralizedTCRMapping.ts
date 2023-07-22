/* eslint-disable prefer-const */
import {
  Bytes,
  BigInt,
  Address,
  ipfs,
  json,
  log
} from "@graphprotocol/graph-ts";

import {
  Dispute,
  LightGeneralizedTCR,
  ItemStatusChange,
  RequestSubmitted,
  MetaEvidence as MetaEvidenceEvent,
  Evidence as EvidenceEvent,
  NewItem,
  Ruling
} from "../generated/templates/LightGeneralizedTCR/LightGeneralizedTCR";
import {
  EvidenceGroupIDToLRequest,
  KlerosBadgeEvidence,
  KlerosBadgeIdToBadgeId,
  KlerosBadgeRequest,
  LEvidence,
  LItem,
  LRegistry,
  LRequest
} from "../generated/schema";

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
// Note that in this mapping, we also use extended status, which just map the combination
// of the item status and disputed status.
//
// A variable naming convention regarding arrays and entities:
// Index: This is the position of the in-contract array.
// ID: This is the entity id.
//
// Example:
// requestIndex: 0
// requestID: <itemID>@<tcrAddress>-0
//
// The only exception to this rule is the itemID, which is the in-contract itemID.
//
// TIP: Before reading an event handler for the very first time, we recommend
// looking at where that event is emitted in the contract. Remember that
// the order in which events are emitted define the order in which
// handlers are run.

let ABSENT = "Absent";
let REGISTERED = "Registered";
let REGISTRATION_REQUESTED = "RegistrationRequested";
let CLEARING_REQUESTED = "ClearingRequested";

let NONE = "None";
let ACCEPT = "Accept";
let REJECT = "Reject";

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

function getFinalRuling(outcome: number): string {
  if (outcome == 0) return NONE;
  if (outcome == 1) return ACCEPT;
  if (outcome == 2) return REJECT;
  return "Error";
}

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

let ZERO_ADDRESS = Bytes.fromHexString(
  "0x0000000000000000000000000000000000000000"
) as Bytes;

export function handleNewItem(event: NewItem): void {
  // todo review, ignores items that are not from TheBadge
  log.debug("ID TEST: {} and kleros badge id: {}", [
    event.address.toHexString(),
    event.params._itemID.toHexString()
  ]);
  const tcrItemID = event.params._itemID.toHexString();

  const klerosBadgeIdToBadgeId = KlerosBadgeIdToBadgeId.load(
    event.params._itemID.toString()
  );

  let test = [
    "0xab6ab0e1eafd0a8e3b64c5b8185045bb88b32368b4202cb3b1cb2839aa23bd03",
    "0xf9fa866cb7a33f3ba7de8d87cf3a13da8f9dc76783ac254bd819ab659eb425f7",
    "0x7328d4763b4c965e8c4b4432378fbf07a44a497a226818fe37e414c24cdb2075",
    "0xf54c469d64d60643e9fcae0d70f6330375d4e6f15aa7f13298c38985159b5544",
    "0x82f17d681de91b71b9e4a8a1a2cdc3c1e5d33c72e71b03cf636d3499a3152292"
  ];

  if (!test.includes(tcrItemID.toLowerCase())) {
    log.error("klerosBadgeIdToBadgeId not found for id {}", [tcrItemID]);
    return;
  }

  // We assume this is an item added via addItemDirectly and care
  // only about saving the item json data.
  // If it was emitted via addItem, all the missing/wrong data regarding
  // things like submission time, arbitrator and deposit will be set in
  // handleRequestSubmitted.
  //
  // Accounting for items added or removed directly is done
  // inside handleStatusUpdated.
  let graphItemID =
    event.params._itemID.toHexString() + "@" + event.address.toHexString();

  let registry = LRegistry.load(event.address.toHexString());
  if (!registry) {
    log.error(`LRegistry {} not found`, [event.address.toHexString()]);
    return;
  }

  let gtcrContract = LightGeneralizedTCR.bind(event.address);
  let itemInfo = gtcrContract.getItemInfo(event.params._itemID);
  let item = new LItem(graphItemID);
  item.itemID = event.params._itemID;
  item.data = event.params._data;
  item.numberOfRequests = BigInt.fromI32(0);
  item.registry = registry.id;
  item.disputed = false;
  item.status = getStatus(itemInfo.value0);
  item.latestRequester = ZERO_ADDRESS;
  item.latestChallenger = ZERO_ADDRESS;
  item.latestRequestResolutionTime = BigInt.fromI32(0);
  item.latestRequestSubmissionTime = BigInt.fromI32(0);

  item.keywords = event.address.toHexString();

  // Offchain item data could be unavailable. We cannot let
  // this handler fail otherwise an item would pass the challenge
  // period unnoticed. Instead we set dummy data so challengers
  // have a chance to check this.
  let jsonStr = ipfs.cat(item.data);
  if (!jsonStr) {
    log.error("Failed to fetch item #{} JSON: {}", [graphItemID, item.data]);
    item.save();
    registry.save();
    return;
  }

  // todo: this was original fromBytes, we replaced it to try_fromBytes, as the lasts blocks where incorrect and this was trowing an exception
  let jsonObjValue = json.try_fromBytes(jsonStr as Bytes);
  if (!jsonObjValue || jsonObjValue.isError) {
    log.error(`Error getting json object value for graphItemID {}`, [
      graphItemID
    ]);
    item.save();
    registry.save();
    return;
  }

  let jsonObj = jsonObjValue.value.toObject();
  if (!jsonObj) {
    log.error(`Error converting object for graphItemID {}`, [graphItemID]);
    item.save();
    registry.save();
    return;
  }

  let columnsValue = jsonObj.get("columns");
  if (!columnsValue) {
    log.error(`Error getting column values for graphItemID {}`, [graphItemID]);
    item.save();
    registry.save();
    return;
  }

  let valuesValue = jsonObj.get("values");
  if (!valuesValue) {
    log.error(`Error getting valuesValue for graphItemID {}`, [graphItemID]);
    item.save();
    registry.save();
    return;
  }

  item.save();
  registry.save();
}

export function handleRequestSubmitted(event: RequestSubmitted): void {
  let graphItemID =
    event.params._itemID.toHexString() + "@" + event.address.toHexString();

  let tcr = LightGeneralizedTCR.bind(event.address);

  let item = LItem.load(graphItemID);
  if (!item) {
    log.error(`LItem for graphItemID {} not found.`, [graphItemID]);
    return;
  }

  let registry = LRegistry.load(event.address.toHexString());
  if (!registry) {
    log.error(`LRegistry at address {} not found`, [
      event.address.toHexString()
    ]);
    return;
  }

  // `previousStatus` and `newStatus` are used for accounting.
  // Note that if this is the very first request of an item,
  // item.status and item.dispute are dirty because they were set by
  // handleNewItem, executed before this handler and so `previousStatus`
  // would be wrong. We use a condition to detect if its the very
  // first request and if so, ignore its contents (see below in accounting).
  let previousStatus = getExtendedStatus(item.disputed, item.status);
  let itemInfo = tcr.getItemInfo(event.params._itemID);
  item.numberOfRequests = item.numberOfRequests.plus(BigInt.fromI32(1));
  item.status = getStatus(itemInfo.value0);
  item.latestRequester = event.transaction.from;
  item.latestRequestResolutionTime = BigInt.fromI32(0);
  item.latestRequestSubmissionTime = event.block.timestamp;

  let newStatus = getExtendedStatus(item.disputed, item.status);

  let requestIndex = item.numberOfRequests.minus(BigInt.fromI32(1));
  let requestID = graphItemID + "-" + requestIndex.toString();

  let request = new LRequest(requestID);
  request.disputed = false;
  request.arbitrator = tcr.arbitrator();
  request.arbitratorExtraData = tcr.arbitratorExtraData();
  request.challenger = ZERO_ADDRESS;
  request.requester = event.transaction.from;
  request.numberOfEvidence = BigInt.fromI32(0);
  request.item = item.id;
  request.registry = registry.id;
  request.resolutionTime = BigInt.fromI32(0);
  request.disputeOutcome = NONE;
  request.resolved = false;
  request.disputeID = BigInt.fromI32(0);
  request.submissionTime = event.block.timestamp;
  request.numberOfRounds = BigInt.fromI32(1);
  request.requestType = item.status;
  request.evidenceGroupID = event.params._evidenceGroupID;
  request.creationTx = event.transaction.hash;
  if (request.requestType == REGISTRATION_REQUESTED)
    request.metaEvidence = registry.registrationMetaEvidence;
  else request.metaEvidence = registry.clearingMetaEvidence;

  // Accounting.
  if (itemInfo.value1.equals(BigInt.fromI32(1))) {
    // This is the first request for this item, which must be
    // a registration request.
    registry.numberOfRegistrationRequested = registry.numberOfRegistrationRequested.plus(
      BigInt.fromI32(1)
    );
  } else {
    updateCounters(previousStatus, newStatus, event.address);
  }

  let evidenceGroupIDToLRequest = new EvidenceGroupIDToLRequest(
    event.params._evidenceGroupID.toString() + "@" + event.address.toHexString()
  );
  evidenceGroupIDToLRequest.request = requestID;
  evidenceGroupIDToLRequest.save();
  request.save();
  item.save();
  registry.save();
}

export function handleRequestChallenged(event: Dispute): void {
  let tcr = LightGeneralizedTCR.bind(event.address);
  let itemID = tcr.arbitratorDisputeIDToItemID(
    event.params._arbitrator,
    event.params._disputeID
  );
  let graphItemID = itemID.toHexString() + "@" + event.address.toHexString();
  let item = LItem.load(graphItemID);
  if (!item) {
    log.warning(`LItem {} not found.`, [graphItemID]);
    return;
  }

  let previousStatus = getExtendedStatus(item.disputed, item.status);
  item.disputed = true;
  item.latestChallenger = event.transaction.from;
  let newStatus = getExtendedStatus(item.disputed, item.status);

  let requestIndex = item.numberOfRequests.minus(BigInt.fromI32(1));
  let requestID = graphItemID + "-" + requestIndex.toString();
  let request = LRequest.load(requestID);
  if (!request) {
    log.error(`LRequest {} not found.`, [requestID]);
    return;
  }

  request.disputed = true;
  request.challenger = event.transaction.from;
  request.numberOfRounds = BigInt.fromI32(2);
  request.disputeID = event.params._disputeID;

  // Accounting.
  updateCounters(previousStatus, newStatus, event.address);

  request.save();
  item.save();
}

export function handleStatusUpdated(event: ItemStatusChange): void {
  // This handler is used to handle transations to item statuses 0 and 1.
  // All other status updates are handled elsewhere.
  let tcr = LightGeneralizedTCR.bind(event.address);
  let itemInfo = tcr.getItemInfo(event.params._itemID);
  if (
    itemInfo.value0 == REGISTRATION_REQUESTED_CODE ||
    itemInfo.value0 == CLEARING_REQUESTED_CODE
  ) {
    // LRequest not yet resolved. No-op as changes are handled
    // elsewhere.
    return;
  }

  let graphItemID =
    event.params._itemID.toHexString() + "@" + event.address.toHexString();
  let item = LItem.load(graphItemID);
  if (!item) {
    log.error(`LItem {} not found.`, [graphItemID]);
    return;
  }

  // We take the previous and new extended statuses for accounting purposes.
  let previousStatus = getExtendedStatus(item.disputed, item.status);
  item.status = getStatus(itemInfo.value0);
  item.disputed = false;
  let newStatus = getExtendedStatus(item.disputed, item.status);

  if (previousStatus != newStatus) {
    // Accounting.
    updateCounters(previousStatus, newStatus, event.address);
  }

  if (event.params._updatedDirectly) {
    // Direct actions (e.g. addItemDirectly and removeItemDirectly)
    // don't envolve any requests. Only the item is updated.
    item.save();

    return;
  }

  item.latestRequestResolutionTime = event.block.timestamp;

  let requestIndex = item.numberOfRequests.minus(BigInt.fromI32(1));
  let requestInfo = tcr.getRequestInfo(event.params._itemID, requestIndex);

  let requestID = graphItemID + "-" + requestIndex.toString();
  let request = LRequest.load(requestID);
  if (!request) {
    log.error(`LRequest {} not found.`, [requestID]);
    return;
  }

  request.resolved = true;
  request.resolutionTime = event.block.timestamp;
  request.resolutionTx = event.transaction.hash;
  request.disputeOutcome = getFinalRuling(requestInfo.value6);

  request.save();
  item.save();
}

export function handleMetaEvidence(event: MetaEvidenceEvent): void {
  let registry = LRegistry.load(event.address.toHexString());
  if (!registry) {
    log.error(`LRegistry {} not found.`, [event.address.toHexString()]);
    return;
  }

  registry.metaEvidenceCount = registry.metaEvidenceCount.plus(
    BigInt.fromI32(1)
  );

  registry.save();
}

export function handleEvidence(event: EvidenceEvent): void {
  let evidenceGroupIDToLRequest = EvidenceGroupIDToLRequest.load(
    event.params._evidenceGroupID.toString() + "@" + event.address.toHexString()
  );
  if (!evidenceGroupIDToLRequest) {
    log.error("EvidenceGroupID {} not registered for {}.", [
      event.params._evidenceGroupID.toString(),
      event.address.toHexString()
    ]);
    return;
  }

  let request = LRequest.load(evidenceGroupIDToLRequest.request);
  if (!request) {
    log.error("Request {} not found.", [evidenceGroupIDToLRequest.request]);
    return;
  }

  log.error(`Creating evidence for group id: {}, number of evidences: {}`, [
    event.params._evidenceGroupID.toString(),
    request.numberOfEvidence.toString()
  ]);

  // A new evidence is added but before the counter of evidences should be updated, otherwise the old one is going to be overwritten
  request.numberOfEvidence = request.numberOfEvidence.plus(BigInt.fromI32(1));

  let evidence = new LEvidence(
    request.id + "-" + request.numberOfEvidence.toString()
  );
  evidence.arbitrator = event.params._arbitrator;
  evidence.evidenceGroupID = event.params._evidenceGroupID;
  evidence.party = event.params._party;
  evidence.URI = event.params._evidence;
  evidence.request = request.id;
  evidence.number = request.numberOfEvidence;
  evidence.item = request.item;
  evidence.timestamp = event.block.timestamp;
  evidence.save();
  request.save();

  const itemID = request.item.split("@")[0].toString();
  const kbRequestID = itemID + "-" + request.id.toString().split("-")[1];
  const klerosBadgeRequest = KlerosBadgeRequest.load(kbRequestID);

  if (!klerosBadgeRequest) {
    log.error("KlerosBadgeRequest {} not found.", [kbRequestID]);
    return;
  }

  const klerosBadgeEvidence = new KlerosBadgeEvidence(
    klerosBadgeRequest.id + "-" + request.numberOfEvidence.toString()
  );
  klerosBadgeEvidence.URI = event.params._evidence;
  klerosBadgeEvidence.timestamp = event.block.timestamp;
  klerosBadgeEvidence.save();

  const auxEvidences = klerosBadgeRequest.evidences;
  auxEvidences.push(klerosBadgeEvidence.id);
  klerosBadgeRequest.evidences = auxEvidences;
  klerosBadgeRequest.save();

  evidence.save();
}

export function handleRuling(event: Ruling): void {
  let tcr = LightGeneralizedTCR.bind(event.address);
  let itemID = tcr.arbitratorDisputeIDToItemID(
    event.address,
    event.params._disputeID
  );
  let graphItemID = itemID.toHexString() + "@" + event.address.toHexString();
  let item = LItem.load(graphItemID);
  if (!item) {
    log.error(`LItem {} not found.`, [graphItemID]);
    return;
  }

  let requestID =
    item.id + "-" + item.numberOfRequests.minus(BigInt.fromI32(1)).toString();
  let request = LRequest.load(requestID);
  if (!request) {
    log.error(`LRequest {} not found.`, [requestID]);
    return;
  }

  request.finalRuling = event.params._ruling;
  request.resolutionTime = event.block.timestamp;
  request.save();
}
