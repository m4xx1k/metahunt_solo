import { Module } from "@nestjs/common";

import { AuthModule } from "../platform/auth/auth.module";
import { SubscriptionPlatformModule } from "../platform/subscriptions/subscription-platform.module";

import { MeController } from "./me.controller";
import { MeService } from "./me.service";

@Module({
  imports: [AuthModule, SubscriptionPlatformModule],
  controllers: [MeController],
  providers: [MeService],
})
export class AccountModule {}
