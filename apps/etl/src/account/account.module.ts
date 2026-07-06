import { Module } from "@nestjs/common";

import { AuthModule } from "../platform/auth/auth.module";
import { TelegramModule } from "../04-notify/telegram/telegram.module";
import { MeController } from "./me.controller";
import { MeService } from "./me.service";

// Logged-in account surface (/me). AuthModule provides the JwtAuthGuard;
// TelegramModule provides SubscriptionsService (reused for subscription labels).
@Module({
  imports: [AuthModule, TelegramModule],
  controllers: [MeController],
  providers: [MeService],
})
export class AccountModule {}
