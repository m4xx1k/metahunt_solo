import { Module } from "@nestjs/common";

import { FeedModule } from "../../03-discovery/feed/feed.module";
import { TELEGRAM_ACTIVITIES } from "./activities";
import { DigestController } from "./digest.controller";
import { DigestService } from "./digest.service";
import { NotifySchedulerService } from "./notify-scheduler.service";
import { PendingSubscriptionsGc } from "./pending-subscriptions.gc";
import { SentNotificationsService } from "./sent-notifications.service";
import { SubscriptionsController } from "./subscriptions.controller";
import { SubscriptionsService } from "./subscriptions.service";
import { TelegramCommandsHandler } from "./telegram-commands.handler";
import { TelegramService } from "./telegram.service";

// Isolated bot module. The bot splits into transport (`TelegramService` poller +
// outbound `sendMessage`), an inbound command router (`TelegramCommandsHandler`),
// and an orphan-pending sweeper (`PendingSubscriptionsGc`). Plus the
// `POST /subscriptions` create endpoint (web "Subscribe") and the scheduled
// digest engine (NotifyActivity + notifySubscribersWorkflow + NotifySchedulerService).
@Module({
  imports: [FeedModule],
  controllers: [SubscriptionsController, DigestController],
  providers: [
    TelegramService,
    TelegramCommandsHandler,
    PendingSubscriptionsGc,
    SubscriptionsService,
    SentNotificationsService,
    DigestService,
    NotifySchedulerService,
    ...TELEGRAM_ACTIVITIES,
  ],
  exports: [TelegramService, SubscriptionsService],
})
export class TelegramModule {}
