import { GUARDS_METADATA } from "@nestjs/common/constants";

import { JwtAuthGuard } from "../../platform/auth/jwt-auth.guard";

import { SubscriptionsController } from "./subscriptions.controller";

describe("SubscriptionsController CV boundary", () => {
  it("requires a JWT to create a CV subscription", () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, SubscriptionsController.prototype.createCv),
    ).toEqual(expect.arrayContaining([JwtAuthGuard]));
  });
});
