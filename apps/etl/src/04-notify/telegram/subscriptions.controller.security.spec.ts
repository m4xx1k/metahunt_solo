import { GUARDS_METADATA } from "@nestjs/common/constants";

import { JwtAuthGuard } from "../../platform/auth/jwt-auth.guard";

import { SubscriptionsController } from "./subscriptions.controller";

describe("SubscriptionsController ownership boundary", () => {
  it.each(["create", "createCv"])("requires a JWT to %s a subscription", (method) => {
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        SubscriptionsController.prototype[method as "create" | "createCv"],
      ),
    ).toEqual(expect.arrayContaining([JwtAuthGuard]));
  });
});
