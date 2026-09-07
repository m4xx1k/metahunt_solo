#!/usr/bin/env node
// Test-quality drift guard. Permanent, re-runnable (scripts/README.md).
//
//   node scripts/test-slop-check.mjs <spec-file...>   # explicit
//   <no args, JSON on stdin>                          # Claude Code PostToolUse hook
//
// Flags known low-value test shapes: regex-over-source guards, assertion-free
// tests, faked Drizzle query-builder chains, and tests whose only assertion is
// "was it called" / "is it defined". Rules mirror md/engineering/TESTING.md
// and md/journal/migrations/test-slop-cleanup.md. Precision over recall — a
// noisy guard trains everyone to ignore it.
//
// [BAD]    → exit 2  (blocks a commit that stages the file; nudges the agent)
// [REVIEW] → exit 0  (surfaced, never blocks)
//
// Scope: every *.spec.ts under apps/ and libs/ — unit AND integration.

import { readFileSync } from "node:fs";

const SPEC_RE = /\.spec\.tsx?$/;

/** Read the Claude Code hook's stdin JSON payload, if any. */
function stdinPayload() {
  try {
    const raw = readFileSync(0, "utf8").trim();
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function targetFiles() {
  const args = process.argv.slice(2).filter((a) => SPEC_RE.test(a));
  if (args.length) return args;
  const p = stdinPayload();
  const f = p?.tool_input?.file_path ?? p?.tool_input?.path;
  return f && SPEC_RE.test(f) ? [f] : [];
}

/** Split a spec into individual it()/test() blocks: { name, body, line }. */
function testBlocks(src) {
  const re = /\n[ \t]*(?:it|test)(?:\.each\([\s\S]*?\))?\s*\(\s*(["'`])([\s\S]*?)\1/g;
  const starts = [];
  let m;
  while ((m = re.exec(src))) starts.push({ idx: m.index, name: m[2].replace(/\s+/g, " ").trim() });
  return starts.map((s, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].idx : src.length;
    return { name: s.name, body: src.slice(s.idx, end), line: src.slice(0, s.idx).split("\n").length };
  });
}

// "Was it called / how many times" with NO argument inspection — the tautology.
// `toHaveBeenCalledWith(seam, "literal")` is left alone: that asserts an output.
const INTERACTION_ONLY = /\.(?:not\.)?toHaveBeenCalled\(\)|\.toHaveBeenCalledTimes\(/;
// Always-weak: pass for a huge range of wrong values. `toBeNull()` /
// `toBeUndefined()` are NOT here — "bad input → null" is an exact contract.
const WEAK_ONLY =
  /\.(?:toBeDefined|toBeTruthy|toBeFalsy)\(\)|\.toBeGreaterThan\(\s*0\s*\)|\.toBeGreaterThanOrEqual\(\s*0\s*\)/;

function checkFile(path) {
  const src = readFileSync(path, "utf8");
  const findings = [];
  const add = (sev, line, msg) => findings.push({ sev, line, msg });

  // 1. Source-scan test: asserting on the TEXT of source files instead of
  //    behavior. Reading .xml/.json/.txt fixtures is real test data — spare it.
  const readsFixture =
    /readFileSync\s*\([^;]*?\.(?:xml|json|csv|txt|html|ya?ml|snap|fixture)["'`]/i.test(src) ||
    /\/(?:fixtures?|__fixtures__|data|testdata|__mocks__|golden)\//.test(src);
  const scansSource =
    (/readFileSync\s*\(/.test(src) || /\breaddirSync\s*\(/.test(src)) &&
    (/\.(?:not\.)?toMatch\(|\.toContain\(/.test(src) || /\/[^/\s]*\/\s*\.test\(\s*\w+\s*\)/.test(src)) &&
    (/["'`][^"'`]*\.ts["'`]/.test(src) || /\breaddirSync\b/.test(src) ||
      /\b(?:__dirname|ETL_ROOT|SRC_ROOT|process\.cwd|resolve\(__dirname)/.test(src));
  if (scansSource && !readsFixture) {
    add("BAD", 1, "reads source files and matches their text (regex-over-source) — asserts implementation shape, not behavior; brittle to any rename or move, green even when the invariant is broken via an alias. Delete and assert the behavior it protects, or move it to an ESLint rule.");
  }

  // 2. Query-builder mock: faking select().from().where() then asserting call shape.
  const fnChains = (src.match(/jest\.fn\(\)\s*\.mock(?:Return|Resolved)Value\(/g) || []).length;
  if (fnChains >= 4 && /\b(?:DRIZZLE|drizzle|\.from\(|\.leftJoin\(|\.innerJoin\()/.test(src)) {
    add("BAD", 1, `builds a fake Drizzle query-builder chain (${fnChains} chained jest.fn mocks) — a test that passes even when the SQL is wrong. Use an integration test (Testcontainers) or extract the pure logic. See TESTING.md "Mock at the seam".`);
  }

  // 3 & 4. Per-block: assertion-free / interaction-only / weak-only.
  for (const b of testBlocks(src)) {
    const expects = b.body.match(/\bexpect\s*\(/g) || [];
    const awaitExpects = b.body.match(/\bawait\s+expect\s*\(/g) || [];
    const hasAssert = expects.length || /\bassert(?:\.\w+)?\s*\(/.test(b.body);
    if (!hasAssert) {
      add("BAD", b.line, `"${b.name}" has no expect()/assert — it only checks that nothing threw.`);
      continue;
    }
    const meaningful =
      b.body
        .split("\n")
        .filter((l) => /\bexpect\s*\(/.test(l))
        .some((l) => !INTERACTION_ONLY.test(l) && !WEAK_ONLY.test(l)) ||
      (awaitExpects.length > 0 &&
        /rejects|resolves|toThrow|toEqual|toBe\(|toMatchObject|toStrictEqual/.test(b.body));
    const expectLines = b.body.split("\n").filter((l) => /\bexpect\s*\(/.test(l));
    const onlyInteraction = expectLines.length > 0 && expectLines.every((l) => INTERACTION_ONLY.test(l));
    const onlyWeak = expectLines.length > 0 && expectLines.every((l) => WEAK_ONLY.test(l));
    if (onlyInteraction && !meaningful) {
      add("REVIEW", b.line, `"${b.name}" only asserts toHaveBeenCalled* — verifies wiring, not the observable result. OK for a "must NOT call X" guard; otherwise assert the outcome.`);
    } else if (onlyWeak && !meaningful) {
      add("REVIEW", b.line, `"${b.name}" only asserts toBeDefined/toBeTruthy/>0 — a smoke check. Assert the actual value/shape.`);
    }
  }

  return findings;
}

const files = targetFiles();
if (!files.length) process.exit(0);

let bad = 0;
const lines = [];
for (const f of files) {
  let found;
  try {
    found = checkFile(f);
  } catch {
    continue; // never let the guard break the flow
  }
  if (!found.length) continue;
  lines.push(`\n${f}`);
  for (const x of found) {
    if (x.sev === "BAD") bad++;
    lines.push(`  [${x.sev}] L${x.line}: ${x.msg}`);
  }
}

if (lines.length) {
  process.stderr.write(
    "⚠ test-slop-check — spec(s) trip known antipatterns:\n" +
      lines.join("\n") +
      `\n\nRules: md/journal/migrations/test-slop-cleanup.md · Contract: md/engineering/TESTING.md\n`,
  );
  process.exit(bad ? 2 : 0);
}
process.exit(0);
