import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// MET-138 architecture guard: public discovery/analytics modules must read
// Positions, not raw Postings. A direct aggregate over `vacancies` /
// `vacancy_nodes` is legitimate only for the allowlisted cases in
// IMPLEMENTATION.md (calibration-sensitive scoring pending MET-139,
// apply/source-URL hydration, ingestion/dedup diagnostics) — and every one of
// those must say so with an explicit `POSTING-GRAIN-EXEMPT` comment. This
// test fails on any new raw read that skips that acknowledgment, so the rule
// lives in CI rather than only in a doc someone has to remember to reread.
const SCAN_ROOT = join(__dirname, "../../03-discovery");
const EXEMPT_TOKEN = "POSTING-GRAIN-EXEMPT";

// Matches the raw-SQL and Drizzle-builder shapes this codebase actually uses
// to read the Postings tables directly (see MET-137 IMPLEMENTATION.md).
const RAW_POSTING_READ =
  /\b(FROM|JOIN)\s+vacanc(y_nodes|ies)\b|\.from\((schema\.)?(vacancies|vacancyNodes)\)/;

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...listTsFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".spec.ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("posting-grain architecture guard (MET-138)", () => {
  it("requires an explicit exemption on every raw Postings read under 03-discovery", () => {
    const offenders: string[] = [];
    for (const file of listTsFiles(SCAN_ROOT)) {
      const content = readFileSync(file, "utf8");
      if (!RAW_POSTING_READ.test(content)) continue;
      if (content.includes(EXEMPT_TOKEN)) continue;
      offenders.push(relative(SCAN_ROOT, file));
    }

    if (offenders.length > 0) {
      throw new Error(
        `Direct vacancies/vacancy_nodes read without a "${EXEMPT_TOKEN}" comment in:\n` +
          offenders.map((f) => `  - ${f}`).join("\n") +
          `\n\nPublic discovery/analytics reads must start from the Position read model ` +
          `(positions / postings / position_nodes) per MET-138. If this read is a ` +
          `deliberate exception (MET-139 scoring cutover pending, apply/source-URL ` +
          `hydration, dedup diagnostics), add a comment containing "${EXEMPT_TOKEN}" ` +
          `explaining why.`,
      );
    }
  });
});
