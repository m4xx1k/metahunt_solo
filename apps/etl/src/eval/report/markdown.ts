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
    ["or_split_errors", summary.orSplitErrors.toFixed(1)],
    ["isTech accuracy", pct(summary.guardAccuracy.isTech)],
    ["role accuracy", pct(summary.guardAccuracy.role)],
    ["tokens in / out", `${tokens.in} / ${tokens.out}`],
    ["p50 latency", `${latencies[Math.floor(latencies.length / 2)] ?? 0} ms`],
  ];
  // A pass with provider failures drags the mean; showing it per pass keeps a
  // transient outage from reading as a quality difference.
  const passes =
    run.passes.length > 1
      ? `${run.passes.length} passes — F1 ${run.passes.map((pass) => pct(pass.requirementsF1)).join(" / ")}` +
        `, provider failures ${run.passes.map((pass) => pct(pass.providerFailureRate)).join(" / ")}`
      : "1 pass — repeat it before trusting a small difference";
  return [
    `### ${run.client} · ${run.model} · ${run.extractor}`,
    "",
    `${summary.evaluatedCases} rows, ${Math.round(run.durationMs / 1000)}s, ` +
      `aliases \`${run.aliasSnapshotSha.slice(0, 12)}\`` +
      `${run.gated ? "" : " · draft-only, no release gate"}`,
    "",
    passes,
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
