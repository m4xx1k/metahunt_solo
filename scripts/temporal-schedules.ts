/**
 * Pause / resume / list Temporal schedules. Needed before any migration that
 * mutates taxonomy or vacancies: `rss-ingest-hourly` mints NEW nodes mid-run and
 * refreshes the node_stats / node_skill_cooc matviews at the end of each pass,
 * `tg-digest-daytime` would send users a digest computed against half-migrated
 * data, and `dedup-sweep` moves unique_vacancies under the conservation checks.
 *
 * Connection mirrors platform/temporal/temporal.module.ts. Reads TEMPORAL_* from
 * env — run with prod creds injected, never inline:
 *
 *   railway run --service @metahunt/etl -- \
 *     npx ts-node --project tsconfig.json scripts/temporal-schedules.ts list
 *   ... scripts/temporal-schedules.ts pause  "taxonomy migration"
 *   ... scripts/temporal-schedules.ts resume
 *
 * With no ids it acts on the three schedules the app installs; pass ids to
 * narrow. Idempotent: pausing a paused schedule is a no-op.
 */
import { Client, Connection, ScheduleNotFoundError } from "@temporalio/client";

const DEFAULT_IDS = ["rss-ingest-hourly", "tg-digest-daytime", "dedup-sweep"];

type Action = "pause" | "resume" | "list";

// eslint-disable-next-line no-console
const log = console.log;

async function main(): Promise<void> {
  const action = process.argv[2] as Action | undefined;
  if (!action || !["pause", "resume", "list"].includes(action)) {
    throw new Error("usage: temporal-schedules.ts <pause|resume|list> [note] [--ids a,b]");
  }
  const note = action === "pause" ? (process.argv[3] ?? "maintenance") : undefined;
  const idsArg = process.argv.find((a) => a.startsWith("--ids="));
  const ids = idsArg ? idsArg.slice("--ids=".length).split(",") : DEFAULT_IDS;

  const address = process.env.TEMPORAL_ADDRESS;
  const namespace = process.env.TEMPORAL_NAMESPACE;
  if (!address || !namespace) {
    throw new Error("TEMPORAL_ADDRESS and TEMPORAL_NAMESPACE must be set");
  }
  const apiKey = process.env.TEMPORAL_API_KEY ?? "";
  const cloud = apiKey.length > 0;

  log(`Temporal: ${address} / ${namespace} (cloud=${cloud})`);

  const connection = await Connection.connect({
    address,
    ...(cloud ? { tls: true, apiKey } : {}),
  });
  const client = new Client({ connection, namespace });

  try {
    for (const id of ids) {
      const handle = client.schedule.getHandle(id);
      try {
        if (action === "pause") {
          await handle.pause(note);
          log(`  paused   ${id}  (${note})`);
          continue;
        }
        if (action === "resume") {
          await handle.unpause();
          log(`  resumed  ${id}`);
          continue;
        }
        const d = await handle.describe();
        log(`  ${d.state.paused ? "PAUSED " : "active "} ${id}  note=${d.state.note ?? "-"}`);
      } catch (err) {
        if (err instanceof ScheduleNotFoundError) {
          log(`  absent   ${id}`);
        } else {
          throw err;
        }
      }
    }
  } finally {
    await connection.close();
  }
}

void main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
