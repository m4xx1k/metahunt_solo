import type { RequirementDatasetCase } from "./extraction-eval.types";
import type { summarizeRequirements } from "./extraction.scorer";
import type { RowResult } from "./run-eval";

type Run = {
  startedAt: string;
  extractor: string;
  client: string;
  model: string;
  aliasSnapshotSha: string;
  summary: ReturnType<typeof summarizeRequirements>;
  rows: RowResult[];
};

export function renderRunHtml(run: Run, cases: RequirementDatasetCase[]): string {
  const byId = new Map(cases.map((item) => [item.input.id, item]));
  const rows = [...run.rows].sort((a, b) => a.score.requirementsF1 - b.score.requirementsF1);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(run.client)} — extraction eval</title>
<style>
:root { color-scheme: light dark; --bg: #fff; --fg: #17181c; --muted: #6b7280; --line: #e3e5ea;
  --miss: #b42318; --miss-bg: #fef3f2; --extra: #b54708; --extra-bg: #fffaeb; --hit: #067647; }
@media (prefers-color-scheme: dark) { :root { --bg: #14151a; --fg: #e8e9ed; --muted: #9aa1ad;
  --line: #2a2d35; --miss-bg: #2a1614; --extra-bg: #2a2011; } }
* { box-sizing: border-box; }
body { margin: 0; padding: 24px 16px 64px; background: var(--bg); color: var(--fg);
  font: 14px/1.55 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
main { max-width: 1240px; margin: 0 auto; }
h1 { font-size: 20px; margin: 0 0 4px; }
.meta { color: var(--muted); font-size: 13px; margin-bottom: 20px; }
.summary { display: flex; flex-wrap: wrap; gap: 8px 28px; padding: 14px 16px; margin-bottom: 24px;
  border: 1px solid var(--line); border-radius: 10px; }
.summary div { font-variant-numeric: tabular-nums; }
.summary span { color: var(--muted); display: block; font-size: 12px; }
details { border: 1px solid var(--line); border-radius: 10px; margin-bottom: 10px; }
summary { cursor: pointer; padding: 11px 14px; display: flex; gap: 12px; align-items: baseline; }
summary b { font-weight: 600; flex: 1; }
.f1 { font-variant-numeric: tabular-nums; color: var(--muted); }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; padding: 4px 14px 16px;
  border-top: 1px solid var(--line); }
@media (max-width: 860px) { .cols { grid-template-columns: 1fr; } }
h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted);
  margin: 14px 0 6px; }
pre { margin: 0; white-space: pre-wrap; word-break: break-word; font: 12px/1.5 ui-monospace,
  SFMono-Regular, Menlo, monospace; max-height: 520px; overflow: auto; }
ul { list-style: none; margin: 0; padding: 0; }
li { padding: 2px 7px; border-radius: 5px; font: 12px/1.6 ui-monospace, Menlo, monospace; }
li.miss { color: var(--miss); background: var(--miss-bg); }
li.extra { color: var(--extra); background: var(--extra-bg); }
li.hit { color: var(--muted); }
.err { color: var(--miss); }
</style>
</head>
<body>
<main>
<h1>${escape(run.client)} · ${escape(run.model)}</h1>
<p class="meta">${escape(run.extractor)} · ${run.rows.length} rows · ${escape(run.startedAt)}
 · aliases <code>${escape(run.aliasSnapshotSha.slice(0, 12))}</code> · worst rows first</p>
<div class="summary">
${[
  ["F1", pct(run.summary.requirementsF1)],
  ["precision", pct(run.summary.requirementsPrecision)],
  ["recall", pct(run.summary.requirementsRecall)],
  ["priority", pct(run.summary.priorityAccuracy)],
  ["alternatives", pct(run.summary.alternativeAccuracy)],
  ["or_split_errors", String(run.summary.orSplitErrors)],
  ["schema valid", pct(run.summary.schemaValidRate)],
  ["isTech", pct(run.summary.guardAccuracy.isTech)],
]
  .map(([label, value]) => `<div><span>${label}</span>${value}</div>`)
  .join("\n")}
</div>
${rows.map((row) => renderRow(row, byId.get(row.id))).join("\n")}
</main>
</body>
</html>
`;
}

function renderRow(row: RowResult, item: RequirementDatasetCase | undefined): string {
  const expected = new Set(row.score.expectedClauses);
  const actual = new Set(row.score.actualClauses);
  const clauses = [...new Set([...expected, ...actual])].sort();
  return `<details>
<summary>
  <b>${escape(row.title)}</b>
  <span class="f1">F1 ${pct(row.score.requirementsF1)} · P ${pct(row.score.requirementsPrecision)} · R ${pct(row.score.requirementsRecall)}${row.score.orSplitErrors > 0 ? ` · ${row.score.orSplitErrors} OR split` : ""}</span>
</summary>
<div class="cols">
  <div>
    <h3>Vacancy</h3>
    <pre>${escape(item?.input.text ?? "")}</pre>
  </div>
  <div>
    ${row.error ? `<h3>Error</h3><p class="err">${escape(row.error)}</p>` : ""}
    <h3>Requirements — missing, extra, matched</h3>
    <ul>${clauses
      .map((clause) => {
        const kind = !actual.has(clause) ? "miss" : !expected.has(clause) ? "extra" : "hit";
        const mark = kind === "miss" ? "−" : kind === "extra" ? "+" : " ";
        return `<li class="${kind}">${mark} ${escape(clause)}</li>`;
      })
      .join("")}</ul>
    <h3>Extracted, every field</h3>
    <pre>${escape(JSON.stringify(row.actual, null, 2))}</pre>
  </div>
</div>
</details>`;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function escape(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string,
  );
}
