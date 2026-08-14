// SPIKE — MET-54. Deleted with the verdict memo.
//
//   pnpm ats:poc:ingest  [--tier ua|all]
//   pnpm ats:poc:extract [--budget-usd 0.40] [--limit N]
//   pnpm ats:poc:load
//
// Bronze and silver are the SAME tables RSS uses (`rss_records` → `vacancies`).
// Extraction and loading go through the real ExtractionModule/LoaderModule, so
// what this proves is the production path, not a parallel one. Only the driver
// is throwaway.

import { createHash } from "crypto";
import { mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";

import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";

import { and, eq, isNull, sql } from "drizzle-orm";

import { DatabaseModule, DRIZZLE, schema, type DrizzleDB } from "@metahunt/database";

import { ExtractionModule } from "../../02-enrich/extraction/extraction.module";
import { MODEL_PRICING_USD_PER_MTOK, type ModelName } from "../../02-enrich/extraction/pricing";
import {
  VACANCY_EXTRACTOR,
  type VacancyExtractor,
} from "../../02-enrich/extraction/vacancy-extractor";
import { LoaderModule } from "../../02-enrich/loader/loader.module";
import { VacancyLoaderService } from "../../02-enrich/loader/services/vacancy-loader.service";
import { passesTechGate } from "../rss/utils/vacancy-filter";

import { ashbyAdapter } from "./adapters/ashby.adapter";
import { greenhouseAdapter } from "./adapters/greenhouse.adapter";
import { hurmaAdapter, hurmaNextPageUrl } from "./adapters/hurma.adapter";
import { leverAdapter } from "./adapters/lever.adapter";
import { reconcileAtsBoardSnapshot } from "./ats-lifecycle";
import { ATS_TYPES, type AtsAdapter, type AtsType, type NormalizedItem } from "./ats.contract";

const ADAPTERS: Record<AtsType, AtsAdapter> = {
  ashby: ashbyAdapter,
  greenhouse: greenhouseAdapter,
  lever: leverAdapter,
  hurma: hurmaAdapter,
};

const USER_AGENT = "metahunt-bot (+https://metahunt.dev; contact via site)";
const CONCURRENCY = 6;
const REPO_ROOT = join(__dirname, "../../../../..");
const ARTIFACTS = join(REPO_ROOT, ".poc-artifacts");

const UA_LOCATION =
  /ukrain|kyiv|kiev|lviv|kharkiv|dnipro|odesa|odessa|vinnyts|ivano|ternopil|zhytomyr|київ|львів|харків|дніпро|одеса|україн|вінниц/i;

// Owner's priority order is UA first, then Europe, then US. Tier-2 boards are
// only worth their extraction cost when the posting is reachable from here.
const EU_LOCATION =
  /europe|emea|\beu\b|poland|warsaw|krakow|wroclaw|germany|berlin|munich|spain|madrid|barcelona|portugal|lisbon|porto|netherlands|amsterdam|france|paris|italy|milan|rome|romania|bucharest|bulgaria|sofia|czech|prague|slovakia|hungary|budapest|austria|vienna|ireland|dublin|sweden|stockholm|denmark|copenhagen|finland|helsinki|norway|oslo|estonia|tallinn|latvia|riga|lithuania|vilnius|croatia|serbia|belgrade|greece|athens|cyprus|nicosia|switzerland|zurich|belgium|brussels|united kingdom|london|remote|anywhere|worldwide/i;

interface Board {
  ats: AtsType;
  slug: string;
  company: string;
  tier: "UA" | "OTHER";
}

const UNLISTED_FINDS: Board[] = [
  { ats: "lever", slug: "kyivstar", company: "Kyivstar", tier: "UA" },
  { ats: "ashby", slug: "mindly", company: "Mindly", tier: "UA" },
  { ats: "greenhouse", slug: "appflame", company: "Appflame", tier: "UA" },
  { ats: "ashby", slug: "universe", company: "Universe", tier: "UA" },
  { ats: "hurma", slug: "universalbank", company: "monobank / Fintech Band", tier: "UA" },
  { ats: "hurma", slug: "roshen", company: "ROSHEN", tier: "UA" },
  { ats: "hurma", slug: "yalantis", company: "Yalantis", tier: "UA" },
];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [join(REPO_ROOT, ".env")] }),
    DatabaseModule.forRoot(),
    ExtractionModule,
    LoaderModule,
  ],
})
class AtsPocModule {}

function readBoards(includeAllTiers: boolean): Board[] {
  const tsv = readFileSync(join(REPO_ROOT, "md/todo/ats-sources/ats-slugs.tsv"), "utf8");
  const [, ...rows] = tsv.trim().split("\n");
  const fromTsv = rows.flatMap<Board>((row) => {
    const [tier, ats, slug, company, , , , flag] = row.split("\t");
    // Aggregators are other people's job boards re-listed — excluded by design.
    if (flag === "aggregator") return [];
    if (!ATS_TYPES.includes(ats as AtsType)) return [];
    if (tier !== "UA" && !includeAllTiers) return [];
    return [{ ats: ats as AtsType, slug, company, tier: tier === "UA" ? "UA" : "OTHER" }];
  });

  const seen = new Set<string>();
  return [...fromTsv, ...UNLISTED_FINDS].filter((b) => {
    const key = `${b.ats}/${b.slug.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchBoard(board: Board): Promise<{ items: NormalizedItem[]; raw: unknown }> {
  const adapter = ADAPTERS[board.ats];
  const raw = await fetchJson(adapter.boardUrl(board.slug));
  const items = adapter.toItems(raw, board.slug);

  if (board.ats === "hurma") {
    let next = hurmaNextPageUrl(raw, board.slug);
    for (let page = 0; next && page < 20; page++) {
      const more = await fetchJson(next);
      items.push(...adapter.toItems(more, board.slug));
      next = hurmaNextPageUrl(more, board.slug);
    }
  }
  return { items, raw };
}

function isRelevant(item: NormalizedItem, tier: Board["tier"]): boolean {
  if (tier === "UA") return true;
  const where = item.locations.join(" ");
  return UA_LOCATION.test(where) || EU_LOCATION.test(where) || item.isRemote === true;
}

function contentHash(item: NormalizedItem): string {
  return createHash("sha256")
    .update(item.title + item.descriptionHtml + (item.publishedAt?.toISOString() ?? ""))
    .digest("hex");
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await fn(items[index]);
      }
    }),
  );
  return results;
}

async function ingest(db: DrizzleDB, includeAllTiers: boolean): Promise<void> {
  const boards = readBoards(includeAllTiers);
  mkdirSync(join(ARTIFACTS, "raw"), { recursive: true });
  process.stderr.write(`ingesting ${boards.length} boards…\n`);

  const stats = {
    boards: 0,
    failed: 0,
    fetched: 0,
    relevant: 0,
    techPassed: 0,
    inserted: 0,
    closed: 0,
    reopened: 0,
    skippedEmptySnapshots: 0,
  };

  await mapWithConcurrency(boards, CONCURRENCY, async (board) => {
    let items: NormalizedItem[];
    let raw: unknown;
    try {
      ({ items, raw } = await fetchBoard(board));
    } catch (error) {
      stats.failed++;
      process.stderr.write(`  ✗ ${board.ats}/${board.slug}: ${String(error)}\n`);
      return;
    }
    if (!items.length) {
      // A real zero-job board is possible, but one empty response is not
      // enough evidence to close a whole company. Leave it visible for the
      // next successful non-empty snapshot/manual review.
      stats.skippedEmptySnapshots++;
      return;
    }
    stats.boards++;
    stats.fetched += items.length;
    writeFileSync(join(ARTIFACTS, "raw", `${board.ats}-${board.slug}.json`), JSON.stringify(raw));

    const code = `ats:${board.ats}:${board.slug}`;
    const [source] = await db
      .insert(schema.sources)
      .values({
        code,
        displayName: board.company,
        baseUrl: ADAPTERS[board.ats].boardUrl(board.slug),
        kind: "ats",
        atsType: board.ats,
        atsSlug: board.slug,
      })
      .onConflictDoUpdate({
        target: schema.sources.code,
        set: { displayName: board.company, kind: "ats" },
      })
      .returning();

    const [ingestRow] = await db
      .insert(schema.rssIngests)
      .values({
        sourceId: source.id,
        triggeredBy: "ats-poc-cli",
        startedAt: new Date(),
        finishedAt: new Date(),
        status: "success",
        payloadStorageKey: `ats/${board.ats}-${board.slug}.json`,
      })
      .returning();

    const keep = items.filter((item) => {
      if (!isRelevant(item, board.tier)) return false;
      stats.relevant++;
      // Gate 1: cheap prefilter before spending extraction tokens. ATS gives us
      // a department, which RSS never did.
      if (!passesTechGate({ title: item.title, department: item.department ?? undefined }).pass) {
        return false;
      }
      stats.techPassed++;
      return true;
    });

    for (const item of keep) {
      const inserted = await db
        .insert(schema.rssRecords)
        .values({
          sourceId: source.id,
          rssIngestId: ingestRow.id,
          externalId: item.externalId,
          hash: contentHash(item),
          publishedAt: item.publishedAt ?? new Date(),
          title: item.title,
          description: item.descriptionHtml,
          link: item.link,
          category: item.department,
          atsFields: {
            locations: item.locations,
            isRemote: item.isRemote,
            employmentType: item.employmentType,
            salary: item.salary,
          },
        })
        .onConflictDoNothing()
        .returning({ id: schema.rssRecords.id });
      if (inserted.length) stats.inserted++;
    }

    // `items` is the raw, complete board snapshot rather than the filtered
    // ingest subset. A non-tech or non-UA posting that still exists upstream
    // must not close a vacancy merely because this POC chose not to process it.
    const lifecycle = await reconcileAtsBoardSnapshot(
      db,
      source.id,
      items.map((item) => item.externalId),
    );
    stats.closed += lifecycle.closed;
    stats.reopened += lifecycle.reopened;
    if (lifecycle.skippedEmptySnapshot) stats.skippedEmptySnapshots++;
  });

  process.stdout.write(
    `\nboards ok ${stats.boards} / failed ${stats.failed}\n` +
      `jobs fetched     ${stats.fetched}\n` +
      `geo-relevant     ${stats.relevant}\n` +
      `passed tech gate ${stats.techPassed}\n` +
      `new bronze rows  ${stats.inserted}\n` +
      `closed / reopened ${stats.closed} / ${stats.reopened}` +
      (stats.skippedEmptySnapshots
        ? ` · skipped empty snapshots ${stats.skippedEmptySnapshots}`
        : "") +
      "\n",
  );
}

function costUsd(usage: { in: number; out: number; cached: number }, model: string): number {
  const price =
    MODEL_PRICING_USD_PER_MTOK[model as ModelName] ??
    MODEL_PRICING_USD_PER_MTOK["deepseek-v4-flash"];
  // Cached input is ~50x cheaper; charging it at full rate would overstate the
  // spend and stop the run early.
  const uncachedIn = Math.max(0, usage.in - usage.cached);
  return (
    (uncachedIn / 1e6) * price.in +
    (usage.cached / 1e6) * price.cachedIn +
    (usage.out / 1e6) * price.out
  );
}

async function extract(
  db: DrizzleDB,
  extractor: VacancyExtractor,
  budgetUsd: number,
  limit: number,
): Promise<void> {
  const pending = await db
    .select({
      id: schema.rssRecords.id,
      title: schema.rssRecords.title,
      description: schema.rssRecords.description,
      atsFields: schema.rssRecords.atsFields,
    })
    .from(schema.rssRecords)
    .innerJoin(schema.sources, eq(schema.sources.id, schema.rssRecords.sourceId))
    .where(and(eq(schema.sources.kind, "ats"), isNull(schema.rssRecords.extractedAt)))
    // UA-located first: if the budget runs out, it runs out on the jobs that
    // matter least to this audience. Cyrillic spellings belong here — the
    // Ukrainian ATS writes "Київ", and a Latin-only pattern sorted exactly the
    // most relevant source to the back of the queue.
    .orderBy(
      sql`(${schema.rssRecords.atsFields}->>'locations') !~* 'Ukrain|Kyiv|Lviv|Kharkiv|Dnipro|Odesa|Україн|Київ|Львів|Харків|Дніпро|Одеса'`,
    )
    .limit(limit);

  process.stderr.write(`extracting up to ${pending.length} records, budget $${budgetUsd}…\n`);

  let spent = 0;
  let done = 0;
  let failed = 0;
  let inTokens = 0;
  let outTokens = 0;
  const started = Date.now();

  // Batched rather than one-at-a-time: 1200 sequential round-trips is an hour
  // of wall-clock. The budget is re-checked between batches, so the worst-case
  // overshoot is one batch.
  const extractOne = async (record: (typeof pending)[number]): Promise<void> => {
    try {
      const result = await extractor.extract(`${record.title}\n\n${record.description ?? ""}`);
      spent += costUsd(result.meta.usage, result.meta.usage.model);
      inTokens += result.meta.usage.in;
      outTokens += result.meta.usage.out;
      if (!result.data) {
        failed++;
        return;
      }
      await db
        .update(schema.rssRecords)
        .set({ extractedData: result.data, extractedAt: new Date() })
        .where(eq(schema.rssRecords.id, record.id));
      done++;
      if (done % 50 === 0) {
        process.stderr.write(`  ${done}/${pending.length} · $${spent.toFixed(4)}\n`);
      }
    } catch (error) {
      failed++;
      process.stderr.write(`  ✗ ${String(error).slice(0, 100)}\n`);
    }
  };

  // Batched rather than one-at-a-time: 1200 sequential round-trips is an hour
  // of wall-clock. The budget is re-checked between batches, so the worst-case
  // overshoot is a single batch.
  const BATCH = 8;
  for (let offset = 0; offset < pending.length; offset += BATCH) {
    if (spent >= budgetUsd) {
      process.stderr.write(`budget reached after ${done} records — stopping\n`);
      break;
    }
    await Promise.all(pending.slice(offset, offset + BATCH).map(extractOne));
  }

  const elapsed = (Date.now() - started) / 1000;
  process.stdout.write(
    `\nextracted ${done} (failed ${failed}) in ${elapsed.toFixed(0)}s\n` +
      `tokens in ${inTokens} / out ${outTokens}\n` +
      `spent $${spent.toFixed(4)}  ·  $${done ? (spent / done).toFixed(6) : "0"} per vacancy\n`,
  );
}

async function load(db: DrizzleDB, loader: VacancyLoaderService): Promise<void> {
  const ready = await db
    .select({ id: schema.rssRecords.id })
    .from(schema.rssRecords)
    .innerJoin(schema.sources, eq(schema.sources.id, schema.rssRecords.sourceId))
    .where(and(eq(schema.sources.kind, "ats"), sql`${schema.rssRecords.extractedAt} is not null`));

  let loaded = 0;
  let skippedNonTech = 0;
  let failed = 0;
  for (const record of ready) {
    try {
      const id = await loader.loadFromRecord(record.id);
      if (id) loaded++;
      else skippedNonTech++;
    } catch (error) {
      failed++;
      process.stderr.write(`  ✗ ${record.id}: ${String(error).slice(0, 120)}\n`);
    }
  }
  process.stdout.write(
    `\nloaded ${loaded} vacancies · dropped by LLM tech gate ${skippedNonTech} · failed ${failed}\n`,
  );
}

function flag(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? (process.argv[index + 1] ?? fallback) : fallback;
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const app = await NestFactory.createApplicationContext(AtsPocModule, {
    logger: ["warn", "error"],
  });
  const db = app.get<DrizzleDB>(DRIZZLE);

  try {
    if (command === "ingest") {
      await ingest(db, flag("tier", "ua") === "all");
    } else if (command === "extract") {
      await extract(
        db,
        app.get<VacancyExtractor>(VACANCY_EXTRACTOR),
        Number(flag("budget-usd", process.env.ATS_POC_BUDGET_USD ?? "0.40")),
        Number(flag("limit", "5000")),
      );
    } else if (command === "load") {
      await load(db, app.get(VacancyLoaderService));
    } else {
      process.stderr.write("usage: ats-poc-pipeline <ingest|extract|load>\n");
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

void main();
