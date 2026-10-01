import { Inject, Injectable } from "@nestjs/common";

import { sql } from "drizzle-orm";

import { DRIZZLE } from "@metahunt/database";
import type { ChatNotificationKind, DrizzleDB } from "@metahunt/database";

import { uuidList } from "../../platform/shared/sql";

import type { LedgerEntry } from "./decide";

export type LegacyMessage = "cvRetired" | "loginToManage";

export interface PositionLedgerEntry extends LedgerEntry {
  positionId: string;
}

export interface LedgerWrite {
  chatId: string;
  vacancyId: string;
  positionId: string;
  versionAt: Date;
  kind: ChatNotificationKind;
  subscriptionId: string;
}

type LedgerRow = {
  vacancy_id: string;
  source_id: string;
  position_id: string;
  version_at: Date;
  notified_at: Date | null;
  kind: ChatNotificationKind;
};

// The per-chat, per-posting ledger (`chat_notifications`). Every write is a
// version-guarded upsert, so two runs over one chat can never both win (I2).
@Injectable()
export class AlertLedgerRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /**
   * First v2 run of a chat (§6): set the floor, copy v1's sends, retire CV
   * subscriptions. Returns the legacy messages to send, or null when the chat
   * was already initialised (by this or a concurrent run).
   */
  async lazyInit(chatId: string): Promise<LegacyMessage[] | null> {
    return this.db.transaction(async (tx) => {
      const subs = await tx.execute<{
        id: string;
        is_active: boolean;
        candidate_id: string | null;
        user_id: string | null;
        alerts_floor_at: Date | null;
      }>(sql`
        SELECT id, is_active, candidate_id, user_id, alerts_floor_at
        FROM subscriptions WHERE chat_id = ${chatId}
        FOR UPDATE
      `);
      if (!subs.rows.some((s) => s.is_active && s.alerts_floor_at === null)) return null;

      await tx.execute(sql`
        UPDATE subscriptions SET alerts_floor_at = now()
        WHERE chat_id = ${chatId} AND alerts_floor_at IS NULL
      `);
      await tx.execute(sql`
        INSERT INTO chat_notifications
          (chat_id, vacancy_id, version_at, notified_at, kind, subscription_id, position_id)
        SELECT DISTINCT ON (sn.vacancy_id)
          ${chatId}, sn.vacancy_id,
          least(coalesce(v.published_at, v.loaded_at), r.created_at),
          sn.sent_at, 'new', sn.subscription_id, v.unique_vacancy_id
        FROM sent_notifications sn
        JOIN subscriptions s ON s.id = sn.subscription_id
        JOIN vacancies v ON v.id = sn.vacancy_id
        JOIN rss_records r ON r.id = v.last_rss_record_id
        WHERE s.chat_id = ${chatId}
        ORDER BY sn.vacancy_id, sn.sent_at
        ON CONFLICT (chat_id, vacancy_id) DO NOTHING
      `);
      const retired = await tx.execute<{ id: string }>(sql`
        UPDATE subscriptions
        SET is_active = false, deactivated_at = now(), deactivated_reason = 'retired'
        WHERE chat_id = ${chatId} AND is_active AND candidate_id IS NOT NULL
        RETURNING id
      `);

      const messages: LegacyMessage[] = [];
      if (retired.rows.length > 0) messages.push("cvRetired");
      const ownerless = subs.rows.some(
        (s) => s.is_active && s.candidate_id === null && s.user_id === null,
      );
      if (ownerless) messages.push("loginToManage");
      return messages;
    });
  }

  /** This chat's rows for every posting currently in these positions. */
  async forPositions(chatId: string, positionIds: string[]): Promise<PositionLedgerEntry[]> {
    if (positionIds.length === 0) return [];
    const rows = await this.db.execute<LedgerRow>(sql`
      SELECT cn.vacancy_id, v.source_id, v.unique_vacancy_id AS position_id,
             cn.version_at, cn.notified_at, cn.kind
      FROM chat_notifications cn
      JOIN vacancies v ON v.id = cn.vacancy_id
      WHERE cn.chat_id = ${chatId}
        AND v.unique_vacancy_id IN (${uuidList(positionIds)})
    `);
    return rows.rows.map(toEntry);
  }

  /**
   * Claim a send: store the new version only if it is newer than what the row
   * holds. False → another run already owns this version, do not send.
   */
  async claim(write: LedgerWrite): Promise<boolean> {
    const rows = await this.db.execute(sql`
      INSERT INTO chat_notifications AS cn
        (chat_id, vacancy_id, version_at, notified_at, kind, subscription_id, position_id)
      VALUES (${write.chatId}, ${write.vacancyId}, ${write.versionAt}, now(), ${write.kind},
              ${write.subscriptionId}, ${write.positionId})
      ON CONFLICT (chat_id, vacancy_id) DO UPDATE
        SET version_at = excluded.version_at, notified_at = excluded.notified_at,
            kind = excluded.kind, position_id = excluded.position_id, updated_at = now()
        WHERE cn.version_at < excluded.version_at
      RETURNING 1
    `);
    return rows.rows.length > 0;
  }

  /** Absorbed / collapsed: store the version, keep whatever notified_at the row had. */
  async record(write: LedgerWrite): Promise<void> {
    await this.db.execute(sql`
      INSERT INTO chat_notifications AS cn
        (chat_id, vacancy_id, version_at, notified_at, kind, subscription_id, position_id)
      VALUES (${write.chatId}, ${write.vacancyId}, ${write.versionAt}, NULL, ${write.kind},
              ${write.subscriptionId}, ${write.positionId})
      ON CONFLICT (chat_id, vacancy_id) DO UPDATE
        SET version_at = excluded.version_at, kind = excluded.kind,
            position_id = excluded.position_id, updated_at = now()
        WHERE cn.version_at < excluded.version_at
    `);
  }

  /** A definite Telegram refusal: put the row back the way the claim found it. */
  async undo(write: LedgerWrite, previous: LedgerEntry | null): Promise<void> {
    if (!previous) {
      await this.db.execute(sql`
        DELETE FROM chat_notifications
        WHERE chat_id = ${write.chatId} AND vacancy_id = ${write.vacancyId}
          AND version_at = ${write.versionAt}
      `);
      return;
    }
    await this.db.execute(sql`
      UPDATE chat_notifications
      SET version_at = ${previous.versionAt}, notified_at = ${previous.notifiedAt},
          kind = ${previous.kind}, updated_at = now()
      WHERE chat_id = ${write.chatId} AND vacancy_id = ${write.vacancyId}
        AND version_at = ${write.versionAt}
    `);
  }
}

function toEntry(r: LedgerRow): PositionLedgerEntry {
  return {
    vacancyId: r.vacancy_id,
    sourceId: r.source_id,
    positionId: r.position_id,
    versionAt: new Date(r.version_at),
    notifiedAt: r.notified_at ? new Date(r.notified_at) : null,
    kind: r.kind,
  };
}
