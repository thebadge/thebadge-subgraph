import { BigInt, Bytes, log, dataSource } from "@graphprotocol/graph-ts";
import {
  Initialize,
  PaymentMade,
  ProtocolSettingsUpdated,
  TheBadge,
  TransferSingle
} from "../generated/TheBadge/TheBadge";

import {
  BadgeModel,
  Badge,
  ProtocolStatistic,
  ProtocolConfig,
  BadgeKlerosMetaData,
  BadgeThirdPartyMetaData
} from "../generated/schema";
import {
  handleMintStatisticsUpdate,
  initializeProtocolStatistics,
  loadUserCreatorStatisticsOrGetDefault,
  loadUserOrGetDefault,
  PaymentType_CreatorMintFee,
  PaymentType_ProtocolFee,
  PaymentType_UserRegistrationFee,
  PaymentType_UserVerificationFee,
  TheBadgeBadgeStatus_Requested
} from "./utils";
import {
  TheBadgeUsers,
  UpdatedUser,
  UserRegistered
} from "../generated/TheBadgeUsers/TheBadgeUsers";
import {
  BadgeModelCreated,
  BadgeModelUpdated,
  TheBadgeModels
} from "../generated/TheBadgeModels/TheBadgeModels";
import { TheBadgeStore } from "../generated/TheBadge/TheBadgeStore";

// event Initialize(address indexed admin);
export function handleContractInitialized(event: Initialize): void {
  const contractAddress = event.address.toHexString();
  const theBadge = TheBadge.bind(event.address);
  const theBadgeStore = TheBadgeStore.bind(theBadge._badgeStore());
  const admin = event.params.admin;

  const protocolConfigs = new ProtocolConfig(contractAddress);

  // Register new statistic using the contractAddress
  const statistic = initializeProtocolStatistics(contractAddress);

  protocolConfigs.protocolStatistics = statistic.id;
  protocolConfigs.contractAdmin = admin;
  protocolConfigs.feeCollector = theBadgeStore.feeCollector();
  protocolConfigs.registerUserProtocolFee = theBadgeStore.registerUserProtocolFee();
  protocolConfigs.createBadgeModelProtocolFee = theBadgeStore.createBadgeModelProtocolFee();
  protocolConfigs.mintBadgeProtocolDefaultFeeInBps = theBadgeStore.mintBadgeProtocolDefaultFeeInBps();
  protocolConfigs.save();
}

// event UserRegistered(address indexed creator, string metadata);
export function handleUserRegistered(event: UserRegistered): void {
  const id = event.params.user.toHexString();
  const theBadgeUsers = TheBadgeUsers.bind(event.address);
  const theBadgeStore = TheBadgeStore.bind(theBadgeUsers._badgeStore());
  const theBadgeContractAddress = theBadgeStore.allowedContractAddressesByContractName(
    "TheBadge"
  );

  const user = loadUserOrGetDefault(id);
  user.metadataUri = event.params.metadata;
  user.isCreator = true; // TODO REMOVE, this should be managed under the UpdatedUser() listener
  user.isCompany = theBadgeStore.getUser(event.params.user).isCompany;
  user.save();

  const statistic = ProtocolStatistic.load(
    theBadgeContractAddress.toHexString()
  );
  if (!statistic) {
    log.error(
      "handleUserRegistered - ProtocolStatistic not found for contractAddress {}",
      [theBadgeContractAddress.toHexString()]
    );
    return;
  }

  statistic.registeredUsersAmount = statistic.registeredUsersAmount.plus(
    BigInt.fromI32(1)
  );
  const auxUsers = statistic.registeredUsers;
  auxUsers.push(Bytes.fromHexString(id));
  statistic.registeredUsers = auxUsers;
  statistic.save();
}

// event UpdatedUser(indexed address,string,bool,bool,bool);
export function handleUserUpdated(event: UpdatedUser): void {
  const contractAddress = event.address.toHexString();
  const theBadgeUsers = TheBadgeUsers.bind(event.address);
  const theBadgeStore = TheBadgeStore.bind(theBadgeUsers._badgeStore());
  const theBadgeContractAddress = theBadgeStore.allowedContractAddressesByContractName(
    "TheBadge"
  );

  const statistic = ProtocolStatistic.load(
    theBadgeContractAddress.toHexString()
  );
  if (!statistic) {
    // This should not happen as the statistics should be already instantiated in the initialized event of the contract
    log.error(
      "handleUserUpdated - ProtocolStatistic not found for contractAddress {}",
      [contractAddress]
    );
    return;
  }

  const id = event.params.userAddress.toHexString();
  const isCreator = event.params.isCreator;
  const suspended = event.params.suspended;
  const metadata = event.params.metadata;

  const user = loadUserOrGetDefault(id);
  // If is a new creator the creator statistics should be created
  const isNewCreator = !user.isCreator && isCreator;

  user.isCreator = isCreator;
  user.metadataUri = metadata;
  user.suspended = suspended;
  user.save();

  // Create stats for new creator
  if (isNewCreator) {
    statistic.badgeCreatorsAmount = statistic.badgeCreatorsAmount.plus(
      BigInt.fromI32(1)
    );
    const auxCreators = statistic.badgeCreators;
    auxCreators.push(Bytes.fromHexString(id));
    statistic.badgeCreators = auxCreators;
    statistic.save();

    const creatorStatistic = loadUserCreatorStatisticsOrGetDefault(
      contractAddress
    );
    creatorStatistic.save();
  }
}

// event BadgeModelCreated(uint256 indexed badgeModelId, string metadata);
export function handleBadgeModelCreated(event: BadgeModelCreated): void {
  const badgeModelId = event.params.badgeModelId;
  const theBadgeModels = TheBadgeModels.bind(event.address);
  const theBadgeStore = TheBadgeStore.bind(theBadgeModels._badgeStore());
  const theBadgeContractAddress = theBadgeStore.allowedContractAddressesByContractName(
    "TheBadge"
  );
  const _badgeModel = theBadgeStore.badgeModels(badgeModelId);
  const creatorAddress = _badgeModel.getCreator().toHexString();

  // Note: ideally the user should be already created and we should throw an exception here it's not found
  // But on the smart contract there is no restriction about registered users, so it could happen that an user that was not registered
  // Emits the BadgeModelCreated before the CreatorRegistered, therefore we need to create the user entity here
  const user = loadUserOrGetDefault(creatorAddress);

  // Badge model
  const badgeModel = new BadgeModel(badgeModelId.toString());
  badgeModel.uri = event.params.metadata;
  badgeModel.controllerType = _badgeModel.getControllerName();
  badgeModel.validFor = _badgeModel.getValidFor();
  badgeModel.creatorFee = _badgeModel.getMintCreatorFee();
  badgeModel.protocolFeeInBps = _badgeModel.getMintProtocolFee();
  badgeModel.totalFeesGenerated = BigInt.fromI32(0);
  badgeModel.paused = false;
  badgeModel.creator = user.id;
  badgeModel.badgesMintedAmount = BigInt.fromI32(0);
  badgeModel.createdAt = event.block.timestamp;
  badgeModel.contractAddress = event.address;
  badgeModel.version = _badgeModel.getVersion();
  badgeModel.networkName = dataSource.network();
  badgeModel.save();

  // Updates the user with the new created badge
  const auxCreatedBadges = user.createdBadgeModels;
  auxCreatedBadges.push(badgeModel.id);
  user.createdBadgeModels = auxCreatedBadges;
  user.save();

  // Statistics update
  const creatorStatistics = loadUserCreatorStatisticsOrGetDefault(
    badgeModel.creator
  );

  creatorStatistics.createdBadgeModelsAmount = creatorStatistics.createdBadgeModelsAmount.plus(
    BigInt.fromI32(1)
  );
  creatorStatistics.save();

  const protocolStatistics = ProtocolStatistic.load(
    theBadgeContractAddress.toHexString()
  );
  if (protocolStatistics) {
    protocolStatistics.badgeModelsCreatedAmount = protocolStatistics.badgeModelsCreatedAmount.plus(
      BigInt.fromI32(1)
    );
    protocolStatistics.save();
  }
}

// event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value);
export function handleMint(event: TransferSingle): void {
  const theBadge = TheBadge.bind(event.address);
  const theBadgeStore = TheBadgeStore.bind(theBadge._badgeStore());
  const badgeID = event.params.id;
  const _badge = theBadgeStore.badges(badgeID);
  const badgeModelID = _badge.getBadgeModelId().toString();
  let badgeStatus = TheBadgeBadgeStatus_Requested;

  // Badge model
  const badgeModel = BadgeModel.load(badgeModelID);

  if (!badgeModel) {
    log.error("handleMint - BadgeModel not found. badgeId {} badgeModelId {}", [
      badgeID.toString(),
      badgeModelID
    ]);
    return;
  }

  const badgeThirdPartyMetadata = BadgeThirdPartyMetaData.load(
    badgeID.toString()
  );
  const badgeKlerosMetadata = BadgeKlerosMetaData.load(badgeID.toString());
  if (!badgeThirdPartyMetadata && !badgeKlerosMetadata) {
    log.error(
      "handleMint - badgeThirdPartyMetadata or badgeKlerosMetadata not found. badgeId {} badgeModelId {}",
      [badgeID.toString(), badgeModelID]
    );
    return;
  }

  if (badgeThirdPartyMetadata) {
    badgeStatus = badgeThirdPartyMetadata.tcrStatus;
  } else {
    badgeStatus = badgeKlerosMetadata
      ? badgeKlerosMetadata.tcrStatus
      : badgeStatus;
  }

  badgeModel.badgesMintedAmount = badgeModel.badgesMintedAmount.plus(
    BigInt.fromI32(1)
  );
  badgeModel.save();

  // badge
  const badgeId = event.params.id;
  const badge = new Badge(badgeId.toString());
  badge.badgeModel = badgeModelID;
  badge.account = event.params.to.toHexString();
  badge.status = badgeStatus;
  badge.validUntil = _badge.getDueDate();
  badge.createdAt = event.block.timestamp;
  badge.createdTxHash = event.transaction.hash;
  badge.uri = theBadge.uri(badgeId);
  badge.networkName = dataSource.network();
  badge.save();

  // Loads or creates an user if does not exists
  const user = loadUserOrGetDefault(event.params.to.toHexString());

  // Updates statistics
  handleMintStatisticsUpdate(
    user.id,
    badgeModel.creator,
    badgeModel.id,
    badgeModel.contractAddress.toHexString()
  );
}

//  BadgeModelUpdated(uint256 indexed badgeModelId);
export function handleBadgeModelUpdated(event: BadgeModelUpdated): void {
  const badgeModelID = event.params.badgeModelId.toString();
  const theBadgeModels = TheBadgeModels.bind(event.address);
  const theBadgeStore = TheBadgeStore.bind(theBadgeModels._badgeStore());
  const storeBadgeModel = theBadgeStore.badgeModels(event.params.badgeModelId);

  // Badge model
  const badgeModel = BadgeModel.load(badgeModelID);

  if (!badgeModel) {
    log.error(
      "handleBadgeModelUpdated - BadgeModel not found. badgeModelId:  {}",
      [badgeModelID]
    );
    return;
  }

  badgeModel.protocolFeeInBps = storeBadgeModel.getMintProtocolFee();
  badgeModel.creatorFee = storeBadgeModel.getMintCreatorFee();
  badgeModel.paused = storeBadgeModel.getPaused();
  badgeModel.save();
}

// ProtocolSettingsUpdated();
export function handleProtocolSettingsUpdated(
  event: ProtocolSettingsUpdated
): void {
  const theBadge = TheBadge.bind(event.address);
  const theBadgeStore = TheBadgeStore.bind(theBadge._badgeStore());

  const protocolConfigs = ProtocolConfig.load(event.address.toHexString());

  if (!protocolConfigs) {
    log.error(
      "handleProtocolSettingsUpdated - protocol settings not found!, ID: {}",
      [event.address.toHexString()]
    );
    return;
  }

  protocolConfigs.registerUserProtocolFee = theBadgeStore.registerUserProtocolFee();
  protocolConfigs.createBadgeModelProtocolFee = theBadgeStore.createBadgeModelProtocolFee();
  protocolConfigs.mintBadgeProtocolDefaultFeeInBps = theBadgeStore.mintBadgeProtocolDefaultFeeInBps();
  protocolConfigs.save();
}

// PaymentMade(address indexed recipient,address payer,uint256 amount, PaymentType indexed paymentType,uint256 indexed badgeModelId,string controllerName);
export function handlePaymentMade(event: PaymentMade): void {
  const badgeModelId = event.params.badgeModelId.toString();
  const paidAmount = event.params.amount;
  const paymentType = event.params.paymentType;
  const recipient = event.params.recipient.toHexString();

  const statistic = ProtocolStatistic.load(event.address.toHexString());
  if (!statistic) {
    log.error(
      "handlePaymentMade - ProtocolStatistics not found. protocolStatisticsId:  {}",
      [event.address.toHexString()]
    );
    return;
  }

  // Logic for update protocol fees
  if (
    paymentType == PaymentType_ProtocolFee ||
    paymentType == PaymentType_UserRegistrationFee ||
    paymentType == PaymentType_UserVerificationFee
  ) {
    statistic.protocolEarnedFees = statistic.protocolEarnedFees.plus(
      paidAmount
    );
    statistic.save();
  }

  // Logic for update creator fees
  if (paymentType == PaymentType_CreatorMintFee) {
    statistic.totalCreatorsFees = statistic.totalCreatorsFees.plus(paidAmount);
    const creatorStatistic = loadUserCreatorStatisticsOrGetDefault(recipient);
    creatorStatistic.totalFeesEarned = creatorStatistic.totalFeesEarned.plus(
      paidAmount
    );
    statistic.save();
    creatorStatistic.save();
  }

  // Logic for update badge model fees
  const badgeModel = BadgeModel.load(badgeModelId);

  if (!badgeModel) {
    log.error("handlePaymentMade - BadgeModel not found. badgeModelId:  {}", [
      badgeModelId
    ]);
    return;
  }
  badgeModel.totalFeesGenerated = badgeModel.totalFeesGenerated.plus(
    paidAmount
  );
  badgeModel.save();
}
