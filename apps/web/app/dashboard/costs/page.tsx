import type { Metadata } from "next";

import {
  extractionCostApi,
  type ExtractionCostByModel,
  type ExtractionCostByVersion,
  type ExtractionCostRecent,
  type ExtractionCostTotals,
} from "@/lib/api/extraction-cost";
import { formatCount, formatPercent, formatRelative, formatTokens, formatUsd } from "@/lib/format";
import { DataTable, type Column } from "@/ui/data/DataTable";
import { StatCard } from "@/ui/data/StatCard";
import { StatGrid } from "@/ui/data/StatGrid";
import { PageBody } from "@/ui/layout/PageBody";
import { PageHeader } from "@/ui/layout/PageHeader";
import { Panel } from "@/ui/layout/Panel";
import { UrlTabPanel, UrlTabs, UrlTabsList, type UrlTab } from "@/ui/navigation/UrlTabs";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Costs" };

const TABS: UrlTab[] = [
  { value: "prompts", label: "Prompts" },
  { value: "models", label: "Models" },
  { value: "recent", label: "Recent" },
];

// Both breakdown tables (by prompt version, by model) share every column but
// the first, so the totals columns are generated once per row type.
function totalsColumns<T extends ExtractionCostTotals>(): Array<Column<T>> {
  return [
    { key: "count", header: "calls", align: "right", render: (row) => formatCount(row.count) },
    {
      key: "failures",
      header: "failures",
      align: "right",
      render: (row) => (
        <span className={row.failures > 0 ? "text-danger" : undefined}>
          {formatCount(row.failures)}
        </span>
      ),
    },
    {
      key: "tokensIn",
      header: "tokens in",
      align: "right",
      render: (row) => formatTokens(row.tokensIn),
    },
    {
      key: "tokensOut",
      header: "tokens out",
      align: "right",
      render: (row) => formatTokens(row.tokensOut),
    },
    {
      key: "tokensCached",
      header: "cached",
      align: "right",
      render: (row) => formatTokens(row.tokensCached),
    },
    {
      key: "costUsd",
      header: "cost",
      align: "right",
      render: (row) => <span className="text-text-primary">{formatUsd(row.costUsd)}</span>,
    },
  ];
}

const PROMPT_COLUMNS: Array<Column<ExtractionCostByVersion>> = [
  {
    key: "version",
    header: "version",
    render: (row) => (
      <span className="text-text-primary">
        {row.promptVersion == null ? "—" : `v${row.promptVersion}`}
      </span>
    ),
  },
  ...totalsColumns<ExtractionCostByVersion>(),
];

const MODEL_COLUMNS: Array<Column<ExtractionCostByModel>> = [
  {
    key: "model",
    header: "model",
    render: (row) => <span className="text-text-primary">{row.model ?? "unknown"}</span>,
  },
  ...totalsColumns<ExtractionCostByModel>(),
];

const RECENT_COLUMNS: Array<Column<ExtractionCostRecent>> = [
  {
    key: "when",
    header: "when",
    render: (row) => <span className="text-text-primary">{formatRelative(row.extractedAt)}</span>,
  },
  {
    key: "version",
    header: "version",
    render: (row) => (row.promptVersion == null ? "—" : `v${row.promptVersion}`),
  },
  { key: "model", header: "model", render: (row) => row.model ?? "—" },
  { key: "tokensIn", header: "in", align: "right", render: (row) => formatTokens(row.tokensIn) },
  { key: "tokensOut", header: "out", align: "right", render: (row) => formatTokens(row.tokensOut) },
  {
    key: "tokensCached",
    header: "cached",
    align: "right",
    render: (row) => formatTokens(row.tokensCached),
  },
  { key: "cost", header: "cost", align: "right", render: (row) => formatUsd(row.costUsd) },
  {
    key: "status",
    header: "status",
    align: "right",
    render: (row) =>
      row.isFailure ? <span className="text-danger">failed</span> : <span>ok</span>,
  },
];

// LLM extraction spend. Every call is metered (model, tokens, cache hits,
// failure) — this screen is the ledger.
export default async function CostsPage() {
  const { total, last24h, byPromptVersion, byModel, recent } = await extractionCostApi.summary();
  const avgOut = total.count > 0 ? Math.round(total.tokensOut / total.count) : 0;

  return (
    <UrlTabs tabs={TABS}>
      <PageHeader
        title="Costs"
        hint="llm extraction spend · priced from the model table in source"
        tabs={<UrlTabsList label="cost breakdowns" />}
      />

      <PageBody>
        <StatGrid cols={4}>
          <StatCard
            label="all time"
            value={formatUsd(total.costUsd)}
            hint={`${formatCount(total.count)} calls · ${formatCount(total.failures)} failures`}
            tone="accent"
          />
          <StatCard
            label="last 24h"
            value={formatUsd(last24h.costUsd)}
            hint={`${formatCount(last24h.count)} calls · ${formatCount(last24h.failures)} failures`}
          />
          <StatCard
            label="tokens in"
            value={formatTokens(total.tokensIn)}
            hint={`${formatTokens(total.tokensCached)} cached · ${formatPercent(total.tokensCached, total.tokensIn)} hit rate`}
          />
          <StatCard
            label="tokens out"
            value={formatTokens(total.tokensOut)}
            hint={`${formatCount(avgOut)} per call on average`}
          />
        </StatGrid>

        <UrlTabPanel value="prompts">
          <Panel title="By prompt version" meta="each template bump gets a version">
            <DataTable
              columns={PROMPT_COLUMNS}
              rows={byPromptVersion}
              rowKey={(row) => String(row.promptVersion ?? "n/a")}
              minWidth={880}
              empty="no calls recorded yet"
            />
          </Panel>
        </UrlTabPanel>

        <UrlTabPanel value="models">
          <Panel title="By model" meta="unknown models are not priced">
            <DataTable
              columns={MODEL_COLUMNS}
              rows={byModel}
              rowKey={(row) => row.model ?? "unknown"}
              minWidth={880}
              empty="no calls recorded yet"
            />
          </Panel>
        </UrlTabPanel>

        <UrlTabPanel value="recent">
          <Panel title="Recent calls" meta={`${recent.length} newest first`}>
            <DataTable
              columns={RECENT_COLUMNS}
              rows={recent}
              rowKey={(row) => row.id}
              minWidth={960}
              empty="no recent calls"
            />
          </Panel>
        </UrlTabPanel>
      </PageBody>
    </UrlTabs>
  );
}
