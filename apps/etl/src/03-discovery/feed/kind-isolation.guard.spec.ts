import { readFileSync } from "node:fs";
import { join } from "node:path";

// D5 guard (md/journal/migrations/taxonomy-implication-graph.md). `nodes.kind`
// is a style hint for the filter rail ONLY — a way to paint CONCEPT chips.
// It must never enter a ranking, node-stats or /match query: if it did, a rare
// TECH skill could outrank a common CONCEPT one purely by type, which the
// design forbids. These are cheap source-scan assertions with no DB, so the
// invariant breaks the build the moment someone joins `kind` into scoring.

const ETL_ROOT = join(__dirname, "../../..");
const read = (rel: string): string => readFileSync(join(ETL_ROOT, rel), "utf8");

describe("kind isolation (D5 CI guard)", () => {
  it("the filter-rail query does carry nodes.kind", () => {
    expect(read("src/03-discovery/feed/facets.service.ts")).toMatch(/n\.kind::text AS kind/);
  });

  // The scoring / node-stats / match query paths must not reference `kind` at
  // all. `score.contract.ts` legitimately owns a different `kind` (the score
  // signal type), so it is deliberately not on this list — only the SQL is.
  it.each([
    "src/03-discovery/score/score.sql.ts",
    "src/01-ingest/rss/activities/refresh-node-stats.activity.ts",
    "src/03-discovery/cv/candidate-match.service.ts",
    "src/03-discovery/ranking/ranking.service.ts",
    "src/03-discovery/ranking/recommendation.service.ts",
  ])("%s never reads node kind", (rel) => {
    expect(read(rel)).not.toMatch(/\bkind\b/i);
  });
});
