import type { ConfigService } from "@nestjs/config";

import { csvList } from "../../platform/shared/coerce";

export interface AlertsFlags {
  engine: "v1" | "v2";
  canaryChatIds: ReadonlySet<string>;
}

export function alertsFlags(config: ConfigService): AlertsFlags {
  return {
    engine: config.get<string>("ALERTS_ENGINE") === "v2" ? "v2" : "v1",
    canaryChatIds: new Set(csvList(config.get<string>("ALERTS_V2_CHAT_IDS"))),
  };
}

/** False = v1 only, and the schedule keeps v1's workflow untouched. */
export function v2InPlay(flags: AlertsFlags): boolean {
  return flags.engine === "v2" || flags.canaryChatIds.size > 0;
}

export function chatUsesV2(flags: AlertsFlags, chatId: string): boolean {
  return flags.engine === "v2" || flags.canaryChatIds.has(chatId);
}
