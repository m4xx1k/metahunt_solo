import type { EvalRun } from "../types";

export function renderRunMarkdown(run: EvalRun): string {
  const { summary } = run;
  const tokens = run.rows.reduce(
    (total, row) => ({ in: total.in + row.usage.in, out: total.out + row.usage.out }),
    { in: 0, out: 0 },
  );
  const latencies = run.rows.map((row) => row.usage.ms ?? 0).sort((a, b) => a - b);
  const metrics: Array<[string, string]> = [
    ["schema valid", pct(summary.schemaValidRate)],
    ["provider failures", pct(summary.providerFailureRate)],
    ["precision", pct(summary.requirementsPrecision)],
    ["recall", pct(summary.requirementsRecall)],
    ["F1", pct(summary.requirementsF1)],
    ["priority accuracy", pct(summary.priorityAccuracy)],
    ["alternative accuracy", pct(summary.alternativeAccuracy)],
    ["or_split_errors", String(summary.orSplitErrors)],
    ["isTech accuracy", pct(summary.guardAccuracy.isTech)],
    ["role accuracy", pct(summary.guardAccuracy.role)],
    ["tokens in / out", `${tokens.in} / ${tokens.out}`],
    ["p50 latency", `${latencies[Math.floor(latencies.length / 2)] ?? 0} ms`],
  ];
  return [
    `### ${run.client} · ${run.model} · ${run.extractor}`,
    "",
    `${summary.evaluatedCases} rows, ${Math.round(run.durationMs / 1000)}s, ` +
      `aliases \`${run.aliasSnapshotSha.slice(0, 12)}\`` +
      `${run.gated ? "" : " · draft-only, no release gate"}`,
    "",
    "| metric | value |",
    "|---|---|",
    ...metrics.map(([name, value]) => `| ${name} | ${value} |`),
    "",
    // seniority is a regex over the title, identical for any model — comparing it invents a tie.
    "`seniority` is omitted: `advertisedSeniority()` is deterministic, not a model answer.",
    "",
  ].join("\n");
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
