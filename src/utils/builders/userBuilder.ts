import { User } from "../../../generated/schema";
import { TheBadgeUsers__getUserResultValue0Struct } from "../../../generated/TheBadge/TheBadgeUsers";

export class UserBuilder {
  private user: User;

  constructor(
    id: string,
    contractUser: TheBadgeUsers__getUserResultValue0Struct
  ) {
    const userLoaded = User.load(id);
    if (!userLoaded) {
      this.user = new User(id);
      this.user.isCurator = false; // You might want to pass this as a parameter if needed
      this.user.createdBadgeModels = [];
      this.user.isRegistered = true;
    } else {
      this.user = userLoaded;
    }
    this.user.metadataUri = contractUser.metadata;
    this.user.isCompany = contractUser.isCompany;
    this.user.suspended = contractUser.suspended;
    this.user.isCreator = contractUser.isCreator;
  }

  // You can add methods for optional parameters or additional configurations here

  build(): User {
    return this.user;
  }
}
