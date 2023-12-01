import { Badge } from "../../../generated/schema";
import { BadgeRequested } from "../../../generated/TheBadge/TheBadge";
import {dataSource} from "@graphprotocol/graph-ts";
import {TheBadgeStore__badgesResult} from "../../../generated/TheBadge/TheBadgeStore";

export class BadgeBuilder {
  private badge: Badge;

  constructor(
    badgeId: string,
    badgeModelID: string,
    badgeRecipient: string,
    badgeStatus: string,
    _badge: TheBadgeStore__badgesResult,
    badgeUri: string,
    event: BadgeRequested
  ) {
    this.badge = new Badge(badgeId);
    this.badge.badgeModel = badgeModelID;
    this.badge.account = badgeRecipient;
    this.badge.status = badgeStatus;
    // TODO CONVERT * 1000 is used to convert the Ethereum timestamp (in seconds) to JavaScript's expected milliseconds.
    this.badge.validUntil = _badge.getDueDate();
    this.badge.createdAt = event.block.timestamp;
    this.badge.createdTxHash = event.transaction.hash;
    this.badge.contractAddress = event.address;
    this.badge.uri = badgeUri;
    this.badge.networkName = dataSource.network();
  }

  // You can add methods for optional parameters or additional configurations here

  build(): Badge {
    return this.badge;
  }
}
