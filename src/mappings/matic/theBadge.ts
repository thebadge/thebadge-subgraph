import { BigInt, Bytes, log, dataSource, store } from "@graphprotocol/graph-ts";
import {
  BadgeClaimed,
  BadgeRequested,
  Initialize,
  PaymentMade,
  ProtocolSettingsUpdated,
  TheBadge
} from "../../../generated/TheBadge/TheBadge";
import {
  TheBadgeUsers,
  UpdatedUser,
  UserRegistered
} from "../../../generated/TheBadge/TheBadgeUsers";
import { TheBadgeStore } from "../../../generated/TheBadge/TheBadgeStore";
import {
  Badge,
  BadgeKlerosMetaData,
  BadgeModel,
  BadgeThirdPartyMetaData,
  ProtocolConfig,
  ProtocolStatistic,
  User
} from "../../../generated/schema";
import {
  handleMintStatisticsUpdate,
  initializeProtocolStatistics,
  loadUserCreatorStatisticsOrGetDefault,
  loadUserOrGetDefault,
  loadUserStatisticsOrGetDefault,
  PaymentType_CreatorMintFee,
  PaymentType_ProtocolFee,
  PaymentType_UserRegistrationFee,
  PaymentType_UserVerificationFee,
  TheBadgeBadgeStatus_Requested
} from "../../utils";
import {
  BadgeModelCreated,
  BadgeModelSuspended,
  BadgeModelUpdated,
  TheBadgeModels
} from "../../../generated/TheBadge/TheBadgeModels";

// event Initialize(address indexed admin);
export function handleContractInitialized(event: Initialize): void {
  const contractAddress = event.address.toHexString();
  const admin = event.params.admin;
  const protocolConfigs = new ProtocolConfig(contractAddress);

  // Register new statistic using the contractAddress
  const statistic = initializeProtocolStatistics(contractAddress);
  statistic.save();

  protocolConfigs.protocolStatistics = statistic.id;
  protocolConfigs.contractAdmin = admin;

  protocolConfigs.registerUserProtocolFee = new BigInt(0);
  protocolConfigs.createBadgeModelProtocolFee = new BigInt(0);
  protocolConfigs.mintBadgeProtocolDefaultFeeInBps = new BigInt(0);
  protocolConfigs.claimBadgeProtocolFee = new BigInt(0);
  protocolConfigs.save();
}

// event UserRegistered(address indexed creator, string metadata);
export function handleUserRegistered(event: UserRegistered): void {
  const id = event.params.user.toHexString();

  const chainName = dataSource.network(); // returns network name

  log.error("handleUserRegistered - POLYGON LOADED {} with chainId: {}", [
    event.address.toHexString(),
    chainName
  ]);

  const theBadgeUsers = TheBadgeUsers.bind(event.address);
  const theBadgeStore = TheBadgeStore.bind(theBadgeUsers._badgeStore());
  const theBadgeContractAddress = theBadgeStore.allowedContractAddressesByContractName(
    "TheBadge"
  );
  const contractUser = theBadgeUsers.getUser(event.params.user);

  let user = User.load(id);
  if (!user) {
    user = new User(id);
    user.metadataUri = contractUser.metadata;
    user.isCompany = contractUser.isCompany;
    user.suspended = contractUser.suspended;
    user.isCurator = false;
    user.isCreator = contractUser.isCreator;
    user.createdBadgeModels = [];
    user.isRegistered = true;
  } else {
    user.metadataUri = contractUser.metadata;
    user.isCompany = contractUser.isCompany;
    user.suspended = contractUser.suspended;
    user.isCreator = contractUser.isCreator;
    user.isRegistered = true;
  }
  user.save();

  // Setup statistics for the user
  const userStatistics = loadUserStatisticsOrGetDefault(id);
  userStatistics.save();

  // Add a new registered user to the protocol statistics
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
  const user = User.load(id);

  if (!user) {
    log.error(
      "handleUserUpdated - User with address {} not found, please check the contract as it could be an error there",
      [id]
    );
    return;
  }

  const contractUser = theBadgeUsers.getUser(event.params.userAddress);

  user.isCreator = contractUser.isCreator;
  user.metadataUri = contractUser.metadata;
  user.suspended = contractUser.suspended;
  user.save();

  if (contractUser.isCreator) {
    // New creator registered
    if (!statistic.badgeCreators.includes(Bytes.fromHexString(id))) {
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
}

// event BadgeModelCreated(uint256 indexed badgeModelId);
export function handleBadgeModelCreated(event: BadgeModelCreated): void {
  const badgeModelId = event.params.badgeModelId;
  const theBadgeModels = TheBadgeModels.bind(event.address);
  const theBadgeStore = TheBadgeStore.bind(theBadgeModels._badgeStore());
  const theBadgeContractAddress = theBadgeStore.allowedContractAddressesByContractName(
    "TheBadge"
  );
  const _badgeModel = theBadgeStore.badgeModels(badgeModelId);
  const creatorAddress = _badgeModel.getCreator().toHexString();

  const user = User.load(creatorAddress);

  if (!user) {
    log.error(
      "handleBadgeModelCreated - User with address {} not found, please check the contract as it could be an error there",
      [creatorAddress]
    );
    return;
  }

  // Badge model
  const badgeModel = new BadgeModel(badgeModelId.toString());
  badgeModel.uri = _badgeModel.getMetadata();
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
  badgeModel.createdTxHash = event.transaction.hash;
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

// event BadgeRequested(uint256 indexed badgeModelID, uint256 indexed badgeID, address indexed recipient, address controller, uint256 controllerBadgeId);
export function handleMint(event: BadgeRequested): void {
  const contractAddress = event.address.toHexString();
  const theBadge = TheBadge.bind(event.address);
  const badgeID = event.params.badgeID;
  const badgeRecipient = event.params.recipient.toHexString();
  const theBadgeStore = TheBadgeStore.bind(theBadge._badgeStore());

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
  const badgeId = badgeID;
  const badge = new Badge(badgeId.toString());
  badge.badgeModel = badgeModelID;
  badge.account = badgeRecipient;
  badge.status = badgeStatus;
  // TODO CONVERT * 1000 is used to convert the Ethereum timestamp (in seconds) to JavaScript's expected milliseconds.
  badge.validUntil = _badge.getDueDate();
  badge.createdAt = event.block.timestamp;
  badge.createdTxHash = event.transaction.hash;
  badge.contractAddress = event.address;
  badge.uri = theBadge.uri(badgeId);
  badge.networkName = dataSource.network();
  badge.save();

  // Loads or creates an user if does not exists
  const user = loadUserOrGetDefault(badgeRecipient);

  // Updates statistics
  handleMintStatisticsUpdate(
    user.id,
    badgeModel.creator,
    badgeModel.id,
    contractAddress
  );
}

// event BadgeClaimed(uint256 indexed badgeId, address indexed origin, address indexed destination);
export function handleClaim(event: BadgeClaimed): void {
  const badgeId = event.params.badgeId;
  const recipientAddress = event.params.destination;

  // badge
  const badgeFound = Badge.load(badgeId.toString());

  if (!badgeFound) {
    log.error(`handleClaim - badge claimed with id: {} not found!`, [
      badgeId.toString()
    ]);
    return;
  }

  const theBadge = TheBadge.bind(event.address);
  const theBadgeStore = TheBadgeStore.bind(theBadge._badgeStore());
  const _badge = theBadgeStore.badges(badgeId);

  // Loads or creates the recipient user if does not exists
  const user = loadUserOrGetDefault(recipientAddress.toHexString());

  badgeFound.account = user.id;
  badgeFound.claimedTxHash = event.transaction.hash;
  badgeFound.claimedAt = event.block.timestamp;
  badgeFound.validUntil = _badge.getDueDate();
  badgeFound.save();
}

// BadgeModelUpdated(uint256 indexed badgeModelId);
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

// BadgeModelSuspended(uint256 indexed badgeModelId, bool suspended);
export function handleBadgeModelSuspended(event: BadgeModelSuspended): void {
  const badgeModelID = event.params.badgeModelId.toString();
  const suspended = event.params.suspended;

  // Badge model
  const badgeModel = BadgeModel.load(badgeModelID);

  if (!badgeModel) {
    log.error(
      "handleBadgeModelUpdated - BadgeModel not found. badgeModelId:  {}",
      [badgeModelID]
    );
    return;
  }

  if (suspended) {
    store.remove("BadgeModel", badgeModelID);
  }
}

// ProtocolSettingsUpdated();
export function handleProtocolSettingsUpdated(
  event: ProtocolSettingsUpdated
): void {
  const theBadgeAddress = event.address;
  const theBadge = TheBadge.bind(theBadgeAddress);
  const tbSTore = theBadge.try__badgeStore();

  if (!tbSTore.reverted) {
    log.error("try__badgeStore - NOT reverted!!!! {} {}", [
      theBadgeAddress.toHexString(),
      tbSTore.value.toHexString()
    ]);
    const theBadgeStore = TheBadgeStore.bind(tbSTore.value);
    let protocolConfigs = ProtocolConfig.load(theBadgeAddress.toHexString());

    if (!protocolConfigs) {
      protocolConfigs = new ProtocolConfig(theBadgeAddress.toHexString());
    }

    // Register new statistic using the contractAddress
    const statistic = initializeProtocolStatistics(
      theBadgeAddress.toHexString()
    );
    statistic.save();

    protocolConfigs.protocolStatistics = statistic.id;
    protocolConfigs.feeCollector = theBadgeStore.feeCollector();

    const theBadgeUsers = TheBadgeUsers.bind(theBadge._badgeUsers());
    protocolConfigs.registerUserProtocolFee = theBadgeUsers.getRegisterFee();
    protocolConfigs.createBadgeModelProtocolFee = theBadgeStore.createBadgeModelProtocolFee();
    protocolConfigs.mintBadgeProtocolDefaultFeeInBps = theBadgeStore.mintBadgeProtocolDefaultFeeInBps();
    protocolConfigs.save();
  } else {
    log.error("try__badgeStore - reverted! {}", [
      theBadgeAddress.toHexString()
    ]);
  }
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
