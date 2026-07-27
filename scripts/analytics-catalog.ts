/**
 * Fails when an analytics event exists in code but not in the console's
 * catalog, or vice versa.
 *
 *   pnpm analytics:catalog
 *
 * Events are produced in two places that cannot import each other (`apps/web`
 * has no workspace dependencies, deliberately — Vercel builds it with Root
 * Directory `apps/web`). Both producers are therefore read as text, which is
 * the whole reason this guard exists: three partial lists of event names had
 * already drifted apart before it was written.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

const PRODUCERS = [
  {
    label: "server ledger",
    path: "apps/etl/src/platform/analytics/events.ts",
    block: /export const ANALYTICS_EVENTS = \{([\s\S]*?)\n\} as const;/,
  },
  {
    label: "browser client",
    path: "apps/web/lib/analytics/use-analytics.ts",
    block: /const ANALYTICS_EVENTS = \{([\s\S]*?)\n\} as const;/,
  },
];

const CATALOG_PATH = "apps/web/entities/analytics/event-catalog.ts";

function eventNamesFrom({ label, path, block }: (typeof PRODUCERS)[number]): string[] {
  const source = readFileSync(join(ROOT, path), "utf8");
  const body = block.exec(source)?.[1];
  if (!body) {
    throw new Error(`${path}: could not find the ANALYTICS_EVENTS object (${label})`);
  }
  return [...body.matchAll(/^\s*\w+:\s*"([a-z0-9_]+)"/gm)].map((match) => match[1]);
}

function catalogNames(): string[] {
  const source = readFileSync(join(ROOT, CATALOG_PATH), "utf8");
  return [...source.matchAll(/^\s{4}name:\s*"([a-z0-9_]+)"/gm)].map((match) => match[1]);
}

function main(): void {
  const produced = new Map<string, string>();
  for (const producer of PRODUCERS) {
    for (const name of eventNamesFrom(producer)) {
      // A name emitted by both producers is fine — the browser mirrors the
      // ledger for the events it relays through the API.
      if (!produced.has(name)) produced.set(name, producer.label);
    }
  }

  const documented = new Set(catalogNames());
  const undocumented = [...produced.keys()].filter((name) => !documented.has(name));
  const orphaned = [...documented].filter((name) => !produced.has(name));

  for (const name of undocumented) {
    console.error(`missing from the catalog: ${name} (emitted by the ${produced.get(name)})`);
  }
  for (const name of orphaned) {
    console.error(`in the catalog but no longer emitted: ${name}`);
  }

  if (undocumented.length > 0 || orphaned.length > 0) {
    console.error(`\n${CATALOG_PATH} is out of sync. Add or remove the entries above.`);
    process.exit(1);
  }

  console.log(`analytics catalog ok — ${documented.size} events documented`);
}

main();
