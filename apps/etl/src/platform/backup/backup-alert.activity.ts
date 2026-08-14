import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { Activity, ActivityMethod } from "nestjs-temporal-core";

import { TelegramService } from "../../04-notify/telegram/telegram.service";

@Injectable()
@Activity()
export class BackupAlertActivity {
  private readonly logger = new Logger(BackupAlertActivity.name);

  constructor(
    private readonly config: ConfigService,
    private readonly telegram: TelegramService,
  ) {}

  @ActivityMethod()
  async alertBackupFailed(reason: string): Promise<void> {
    // A weekly job that fails silently is invisible for a month, which is the
    // failure mode that took production down in the first place.
    this.logger.error(`Weekly database backup failed: ${reason}`);
    const chatId = this.config.get<string>("ALERT_TELEGRAM_CHAT_ID");
    if (!chatId) return;
    await this.telegram.sendMessage(
      chatId,
      `<b>Database backup failed</b>\n\n${escapeHtml(reason)}`,
    );
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
