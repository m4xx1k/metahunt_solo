import { Module } from "@nestjs/common";

import { TelegramModule } from "../../04-notify/telegram/telegram.module";
import { StorageModule } from "../storage/storage.module";

import { BACKUP_ACTIVITIES } from "./activities";
import { BackupSchedulerService } from "./backup-scheduler.service";

@Module({
  imports: [StorageModule, TelegramModule],
  // Activities are listed as Nest providers so the container can resolve them
  // when the Temporal worker instantiates them (see temporal.module).
  providers: [BackupSchedulerService, ...BACKUP_ACTIVITIES],
})
export class BackupModule {}
