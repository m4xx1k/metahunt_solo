/**
 * One-off backfill: for subscriptions that have a `chat_id` but no
 * `tg_username`/`tg_first_name` (rows linked before capture was added at
 * `/start`), resolve the identity via the Telegram Bot API `getChat` and
 * persist it. One `getChat` call per distinct chat_id — every subscription
 * sharing that chat gets the same values. Chats `getChat` can't resolve
 * (left the bot, deleted account, ...) are skipped and stay null.
 *
 *   DRY RUN (default):  npx ts-node --project tsconfig.json scripts/backfill-tg-usernames.ts
 *   APPLY:              npx ts-node --project tsconfig.json scripts/backfill-tg-usernames.ts --apply
 *
 * Reads DATABASE_URL and TELEGRAM_BOT_TOKEN from env.
 */
import "dotenv/config";
import { Pool } from "pg";

interface PendingChat {
  chatId: string;
  subCount: number;
}

interface TelegramGetChatResult {
  ok: boolean;
  result?: { username?: string; first_name?: string };
  description?: string;
}

interface Resolution {
  chatId: string;
  subCount: number;
  username: string | null;
  firstName: string | null;
}

const apply = process.argv.slice(2).includes("--apply");
const GETCHAT_DELAY_MS = 150; // polite pacing — no strict Telegram limit on getChat

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getChat(token: string, chatId: string): Promise<TelegramGetChatResult> {
  const url = `https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent(chatId)}`;
  const res = await fetch(url);
  return (await res.json()) as TelegramGetChatResult;
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  const target = connectionString.replace(/:\/\/([^:]+):[^@]+@/, "://$1:***@");
  // eslint-disable-next-line no-console
  console.log(`\nDB: ${target}\napply=${apply}\n`);

  const pool = new Pool({ connectionString });
  try {
    const { rows: pending } = await pool.query<PendingChat>(
      `SELECT chat_id AS "chatId", count(*)::int AS "subCount"
       FROM subscriptions
       WHERE chat_id IS NOT NULL AND tg_username IS NULL AND tg_first_name IS NULL
       GROUP BY chat_id`,
    );
    // eslint-disable-next-line no-console
    console.log(`Chats to resolve: ${pending.length}`);
    if (pending.length === 0) return;

    const resolved: Resolution[] = [];
    const skipped: { chatId: string; reason: string }[] = [];

    for (const { chatId, subCount } of pending) {
      let response: TelegramGetChatResult;
      try {
        response = await getChat(token, chatId);
      } catch (err) {
        skipped.push({ chatId, reason: err instanceof Error ? err.message : String(err) });
        await sleep(GETCHAT_DELAY_MS);
        continue;
      }
      if (!response.ok || !response.result) {
        skipped.push({ chatId, reason: response.description ?? "unknown error" });
        await sleep(GETCHAT_DELAY_MS);
        continue;
      }
      resolved.push({
        chatId,
        subCount,
        username: response.result.username ?? null,
        firstName: response.result.first_name ?? null,
      });
      await sleep(GETCHAT_DELAY_MS);
    }

    // eslint-disable-next-line no-console
    console.log("\nResolved:");
    for (const r of resolved) {
      // eslint-disable-next-line no-console
      console.log(
        `  chat ${r.chatId} (${r.subCount} sub${r.subCount === 1 ? "" : "s"}): ` +
          `username=${r.username ?? "<none>"} firstName=${r.firstName ?? "<none>"}`,
      );
    }
    // eslint-disable-next-line no-console
    console.log("\nSkipped (left null):");
    for (const s of skipped) {
      // eslint-disable-next-line no-console
      console.log(`  chat ${s.chatId}: ${s.reason}`);
    }
    if (skipped.length === 0) {
      // eslint-disable-next-line no-console
      console.log("  (none)");
    }

    if (!apply) {
      // eslint-disable-next-line no-console
      console.log("\nDRY RUN — nothing written. Re-run with --apply to commit.");
      return;
    }

    let updatedSubs = 0;
    for (const r of resolved) {
      const { rowCount } = await pool.query(
        `UPDATE subscriptions
         SET tg_username = $1, tg_first_name = $2
         WHERE chat_id = $3 AND tg_username IS NULL AND tg_first_name IS NULL`,
        [r.username, r.firstName, r.chatId],
      );
      updatedSubs += rowCount ?? 0;
    }
    // eslint-disable-next-line no-console
    console.log(
      `\nAPPLIED — updated ${updatedSubs} subscription row(s) across ${resolved.length} chat(s).`,
    );
  } finally {
    await pool.end();
  }
}

void main();
