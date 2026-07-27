// SPIKE — MET-54. Deleted with the verdict memo. The adapters it drives are
// production code; this driver is not. Its whole job is to answer "what does
// an ATS board actually give us, and what would it cost" without writing a row
// or spending a token.
//
//   pnpm ats:poc probe            field-coverage matrix over the board list
//   pnpm ats:poc probe --json     same, machine-readable
//
// Deliberately no NestJS bootstrap: a DI container to run four pure functions
// would be ceremony, and the host is already short on memory.

import { writeFileSync } from "fs";
import { readFileSync } from "fs";
import { join } from "path";

import { ashbyAdapter } from "./adapters/ashby.adapter";
import { greenhouseAdapter } from "./adapters/greenhouse.adapter";
import { hurmaAdapter, hurmaNextPageUrl } from "./adapters/hurma.adapter";
import { leverAdapter } from "./adapters/lever.adapter";
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

// Verified by hand 2026-07-27 and not yet in ats-slugs.tsv — MET-92 owns
// folding these back into the research package.
const UNLISTED_FINDS: Board[] = [
  { ats: "lever", slug: "kyivstar", company: "Kyivstar" },
  { ats: "ashby", slug: "mindly", company: "Mindly" },
  { ats: "greenhouse", slug: "appflame", company: "Appflame" },
  { ats: "ashby", slug: "universe", company: "Universe (replaces universe-group, now 404)" },
  { ats: "hurma", slug: "universalbank", company: "monobank / Fintech Band" },
  { ats: "hurma", slug: "roshen", company: "ROSHEN" },
  { ats: "hurma", slug: "yalantis", company: "Yalantis" },
];

interface Board {
  ats: AtsType;
  slug: string;
  company: string;
}

interface BoardReport {
  board: Board;
  ok: boolean;
  error?: string;
  jobs: number;
  uaJobs: number;
  withLocation: number;
  withRemote: number;
  withPublishedAt: number;
  withEmploymentType: number;
  withDepartment: number;
  withSalary: number;
  salaryCurrencies: string[];
  medianDescriptionChars: number;
}

const UA_LOCATION =
  /ukrain|kyiv|kiev|lviv|kharkiv|dnipro|odesa|odessa|vinnyts|київ|львів|харків|дніпро|одеса|україн/i;

function readUaTier(): Board[] {
  const tsv = readFileSync(join(REPO_ROOT, "md/todo/ats-sources/ats-slugs.tsv"), "utf8");
  const [, ...rows] = tsv.trim().split("\n");
  return rows.flatMap((row) => {
    const [tier, ats, slug, company, , , , flag] = row.split("\t");
    if (tier !== "UA" || flag === "aggregator") return [];
    if (!ATS_TYPES.includes(ats as AtsType)) return [];
    return [{ ats: ats as AtsType, slug, company }];
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

async function fetchBoard(board: Board): Promise<NormalizedItem[]> {
  const adapter = ADAPTERS[board.ats];
  const payload = await fetchJson(adapter.boardUrl(board.slug));
  const items = adapter.toItems(payload, board.slug);

  if (board.ats !== "hurma") return items;

  // Only Hurma paginates. Bounded so a bad `last_page` cannot loop forever.
  let next = hurmaNextPageUrl(payload, board.slug);
  for (let page = 0; next && page < 20; page++) {
    const morePayload = await fetchJson(next);
    items.push(...adapter.toItems(morePayload, board.slug));
    next = hurmaNextPageUrl(morePayload, board.slug);
  }
  return items;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function probeBoard(board: Board): Promise<BoardReport> {
  const empty: BoardReport = {
    board,
    ok: false,
    jobs: 0,
    uaJobs: 0,
    withLocation: 0,
    withRemote: 0,
    withPublishedAt: 0,
    withEmploymentType: 0,
    withDepartment: 0,
    withSalary: 0,
    salaryCurrencies: [],
    medianDescriptionChars: 0,
  };

  try {
    const items = await fetchBoard(board);
    return {
      ...empty,
      ok: true,
      jobs: items.length,
      uaJobs: items.filter((i) => i.locations.some((l) => UA_LOCATION.test(l))).length,
      withLocation: items.filter((i) => i.locations.length > 0).length,
      withRemote: items.filter((i) => i.isRemote !== null).length,
      withPublishedAt: items.filter((i) => i.publishedAt !== null).length,
      withEmploymentType: items.filter((i) => i.employmentType !== null).length,
      withDepartment: items.filter((i) => i.department !== null).length,
      withSalary: items.filter((i) => i.salary !== null).length,
      salaryCurrencies: [
        ...new Set(items.flatMap((i) => (i.salary?.currency ? [i.salary.currency] : []))),
      ],
      medianDescriptionChars: median(items.map((i) => i.descriptionHtml.length)),
    };
  } catch (error) {
    return { ...empty, error: error instanceof Error ? error.message : String(error) };
  }
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

function pct(part: number, whole: number): string {
  return whole === 0 ? "—" : `${Math.round((part / whole) * 100)}%`;
}

function renderTable(reports: BoardReport[]): string {
  const ok = reports.filter((r) => r.ok && r.jobs > 0).sort((a, b) => b.uaJobs - a.uaJobs);
  const lines = [
    "| ats | slug | jobs | UA | loc | remote | date | empl | dept | salary | cur | med.desc |",
    "| --- | --- | --: | --: | --: | --: | --: | --: | --: | --: | --- | --: |",
    ...ok.map((r) =>
      [
        r.board.ats,
        r.board.slug,
        r.jobs,
        r.uaJobs,
        pct(r.withLocation, r.jobs),
        pct(r.withRemote, r.jobs),
        pct(r.withPublishedAt, r.jobs),
        pct(r.withEmploymentType, r.jobs),
        pct(r.withDepartment, r.jobs),
        pct(r.withSalary, r.jobs),
        r.salaryCurrencies.join("/") || "—",
        r.medianDescriptionChars,
      ].join(" | "),
    ),
  ];

  const perAts = ATS_TYPES.map((ats) => {
    const group = ok.filter((r) => r.board.ats === ats);
    const jobs = group.reduce((sum, r) => sum + r.jobs, 0);
    if (!jobs) return null;
    const sum = (pick: (r: BoardReport) => number) => group.reduce((acc, r) => acc + pick(r), 0);
    return [
      ats,
      `${group.length} boards`,
      jobs,
      sum((r) => r.uaJobs),
      pct(
        sum((r) => r.withLocation),
        jobs,
      ),
      pct(
        sum((r) => r.withRemote),
        jobs,
      ),
      pct(
        sum((r) => r.withPublishedAt),
        jobs,
      ),
      pct(
        sum((r) => r.withEmploymentType),
        jobs,
      ),
      pct(
        sum((r) => r.withDepartment),
        jobs,
      ),
      pct(
        sum((r) => r.withSalary),
        jobs,
      ),
      [...new Set(group.flatMap((r) => r.salaryCurrencies))].join("/") || "—",
      median(group.map((r) => r.medianDescriptionChars)),
    ].join(" | ");
  }).filter(Boolean);

  const failed = reports.filter((r) => !r.ok);
  const emptyBoards = reports.filter((r) => r.ok && r.jobs === 0);

  return [
    lines.join("\n"),
    "",
    "### Per platform",
    "",
    "| ats | boards | jobs | UA | loc | remote | date | empl | dept | salary | cur | med.desc |",
    "| --- | --- | --: | --: | --: | --: | --: | --: | --: | --: | --- | --: |",
    perAts.join("\n"),
    "",
    `Empty boards (200, zero jobs): ${emptyBoards.length ? emptyBoards.map((r) => `${r.board.ats}/${r.board.slug}`).join(", ") : "none"}`,
    "",
    `Failed: ${failed.length ? failed.map((r) => `${r.board.ats}/${r.board.slug} (${r.error})`).join(", ") : "none"}`,
  ].join("\n");
}

async function main(): Promise<void> {
  const asJson = process.argv.includes("--json");
  const boards = [...readUaTier(), ...UNLISTED_FINDS];
  const seen = new Set<string>();
  const unique = boards.filter((b) => {
    const key = `${b.ats}/${b.slug.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  process.stderr.write(`probing ${unique.length} boards at concurrency ${CONCURRENCY}…\n`);
  const started = Date.now();
  const reports = await mapWithConcurrency(unique, CONCURRENCY, probeBoard);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  const outDir = join(REPO_ROOT, ".poc-artifacts");
  writeFileSync(join(outDir, "probe.json"), JSON.stringify(reports, null, 2));

  if (asJson) {
    process.stdout.write(JSON.stringify(reports, null, 2));
    return;
  }

  const totals = reports.filter((r) => r.ok);
  process.stdout.write(
    [
      `# ATS probe — ${unique.length} boards in ${elapsed}s`,
      "",
      `Reachable: ${totals.length}/${unique.length} · jobs seen: ${totals.reduce((s, r) => s + r.jobs, 0)} · UA-located: ${totals.reduce((s, r) => s + r.uaJobs, 0)}`,
      "",
      renderTable(reports),
      "",
    ].join("\n"),
  );
}

void main();
