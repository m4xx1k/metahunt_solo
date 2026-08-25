/**
 * Guards the analytics event names against three kinds of drift:
 *   1. a name is produced but missing from the console's catalog,
 *   2. a name is in the catalog but no producer declares it,
 *   3. a name is declared but nothing can emit it — the failure that let a
 *      no-op stub survive while the check still reported "34 events documented".
 *
 *   pnpm analytics:catalog
 *
 * Names are read as text, not imported: `apps/web` has no workspace
 * dependencies (Vercel builds it with Root Directory `apps/web`), so the two
 * sides genuinely cannot share a module. That is the whole reason this exists.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

const SERVER_EVENTS = "apps/etl/src/platform/analytics/events.ts";
const BROWSER_EVENTS = "apps/web/lib/analytics/use-analytics.ts";
const CATALOG_PATH = "apps/web/entities/analytics/event-catalog.ts";

interface Producer {
  label: string;
  path: string;
  /** Captures the registry body whose entries this producer declares. */
  block: RegExp;
  /** Files where a live emitter must reference the name. */
  emitters: string[];
  /** How an emitter refers to the event: by registry key or by literal. */
  reference: "key" | "literal";
  /** Names that are emitted outside this repo's control (the browser SDK). */
  externallyEmitted?: string[];
}

const PRODUCERS: Producer[] = [
  {
    label: "server personless",
    path: SERVER_EVENTS,
    block: /export const ANALYTICS_EVENTS = \{([\s\S]*?)\n\} as const;/,
    emitters: ["apps/etl/src/platform/analytics/analytics.service.ts"],
    reference: "key",
  },
  {
    label: "server posthog",
    path: SERVER_EVENTS,
    block: /export const PRODUCT_ANALYTICS_EVENTS = \[([\s\S]*?)\n\] as const;/,
    emitters: ["apps/etl/src/platform/analytics/posthog.client.ts"],
    reference: "literal",
    externallyEmitted: ["$pageview"],
  },
  {
    label: "browser client",
    path: BROWSER_EVENTS,
    block: /const ANALYTICS_EVENTS = \{([\s\S]*?)\n\} as const;/,
    emitters: [BROWSER_EVENTS],
    reference: "key",
  },
];

interface DeclaredEvent {
  name: string;
  key?: string;
  producer: Producer;
}

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

function declaredBy(producer: Producer): DeclaredEvent[] {
  const body = producer.block.exec(read(producer.path))?.[1];
  if (!body) {
    throw new Error(`${producer.path}: could not find the ${producer.label} registry`);
  }
  const entries = [...body.matchAll(/^\s*(?:(\w+):\s*)?"([$a-z0-9_]+)"/gm)];
  return entries.map((match) => ({ name: match[2], key: match[1], producer }));
}

// An emitter is a reference to the event outside the registry itself: a
// `capture()` call site, or a factory that builds the row. A name nothing
// references is a name nothing can send, however well documented it is.
function hasEmitter(event: DeclaredEvent): boolean {
  if (event.producer.externallyEmitted?.includes(event.name)) return true;
  const needle =
    event.producer.reference === "key" ? `ANALYTICS_EVENTS.${event.key}` : `"${event.name}"`;
  return event.producer.emitters.some((path) => {
    const source = read(path);
    const withoutRegistry = source.replace(event.producer.block, "");
    return withoutRegistry.includes(needle);
  });
}

function catalogEntries(): { name: string; historic: boolean }[] {
  const source = read(CATALOG_PATH);
  return [...source.matchAll(/^\s{4}name:\s*"([$a-z0-9_]+)",([\s\S]*?)^\s{2}\},$/gm)].map(
    (match) => ({ name: match[1], historic: match[2].includes("historic: true") }),
  );
}

function main(): void {
  // A name may be declared by two producers — the browser and the server both
  // know `subscription_create_failed` — and one live emitter anywhere is
  // enough to make it reachable.
  const declared = new Map<string, DeclaredEvent[]>();
  for (const producer of PRODUCERS) {
    for (const event of declaredBy(producer)) {
      declared.set(event.name, [...(declared.get(event.name) ?? []), event]);
    }
  }

  const catalog = catalogEntries();
  const documented = new Map(catalog.map((entry) => [entry.name, entry]));
  const problems: string[] = [];

  for (const [name, events] of declared) {
    const entry = documented.get(name);
    if (!entry) {
      const labels = events.map((event) => event.producer.label).join(", ");
      problems.push(`missing from the catalog: ${name} (declared by the ${labels})`);
      continue;
    }
    const reachable = events.some(hasEmitter);
    if (!reachable && !entry.historic) {
      const searched = [...new Set(events.flatMap((event) => event.producer.emitters))];
      problems.push(
        `declared but unreachable: ${name} — no emitter in ${searched.join(", ")}. ` +
          `Wire one, delete the name, or mark the catalog entry \`historic: true\`.`,
      );
    }
    if (reachable && entry.historic) {
      problems.push(`marked historic but still emitted: ${name}`);
    }
  }

  for (const entry of catalog) {
    if (!declared.has(entry.name)) {
      problems.push(`in the catalog but no producer declares it: ${entry.name}`);
    }
  }

  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    console.error(`\n${CATALOG_PATH} is out of sync with the code. Fix the entries above.`);
    process.exit(1);
  }

  const live = catalog.filter((entry) => !entry.historic).length;
  console.log(
    `analytics catalog ok — ${live} events documented and reachable, ` +
      `${catalog.length - live} historic`,
  );
}

main();
