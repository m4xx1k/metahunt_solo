import { Module } from "@nestjs/common";

import { FeedModule } from "../feed/feed.module";
import { TELEGRAM_ACTIVITIES } from "./activities";
import { DigestController } from "./digest.controller";
import { DigestService } from "./digest.service";
import { NotifySchedulerService } from "./notify-scheduler.service";
import { SentNotificationsService } from "./sent-notifications.service";
import { SubscriptionsController } from "./subscriptions.controller";
import { SubscriptionsService } from "./subscriptions.service";
import { TelegramService } from "./telegram.service";

// Isolated bot module: inbound `/start`, `/stop`, `/help` (grammy poller), the
// `POST /subscriptions` create endpoint (web "Subscribe"), the stateless
// outbound `sendMessage`, and the scheduled digest engine (NotifyActivity +
// notifySubscribersWorkflow + NotifySchedulerService).
@Module({
  imports: [FeedModule],
  controllers: [SubscriptionsController, DigestController],
  providers: [
    TelegramService,
    SubscriptionsService,
    SentNotificationsService,
    DigestService,
    NotifySchedulerService,
    ...TELEGRAM_ACTIVITIES,
  ],
  exports: [TelegramService, SubscriptionsService],
})
export class TelegramModule {}
