import { Suspense } from "react";
import { taxonomyApi, type NodeListResult, type TaxonomyCoverage } from "@/lib/api/taxonomy";
import { Tag } from "@/ui";
import { InvestigationHeader } from "../_components/InvestigationHeader";
import { AnalyticsStrip } from "./_components/AnalyticsStrip";
import { Filters } from "./_components/Filters";
import { NodeList } from "./_components/NodeList";
import { DetailPanel, EmptyDetailPanel } from "./_components/DetailPanel";
import { DetailPanelShell } from "./_components/DetailPanelShell";
import { parseTaxonomyPageState } from "./_lib/taxonomy-page-state";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const EMPTY_LIST: NodeListResult = {
  items: [],
  page: 1,
  pageSize: PAGE_SIZE,
  total: 0,
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function TaxonomyPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { type, statuses, q, minBlocked, page, selected } = parseTaxonomyPageState(sp);

  const [coverage, list] = await Promise.all([
    taxonomyApi.coverage().catch((): TaxonomyCoverage | null => null),
    taxonomyApi
      .list({ type, statuses, q, blocked: minBlocked, page, pageSize: PAGE_SIZE })
      .catch((): NodeListResult => EMPTY_LIST),
  ]);

  return (
    <main className="flex min-h-screen flex-col bg-bg">
      <InvestigationHeader title="довідник понять" />

      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-4 py-8 sm:px-6 md:px-12">
        <div className="flex flex-col gap-2">
          <Tag>&gt; робоче місце куратора</Tag>
          <h2 className="font-display text-lg font-bold text-text-primary md:text-xl">
            довідник + черга курації
          </h2>
          <p className="font-mono text-xs text-text-muted">
            фільтри ліворуч · деталі і дії праворуч · усе сериалізується в URL
          </p>
        </div>

        <AnalyticsStrip coverage={coverage} />

        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <div className="flex flex-col gap-3">
            <Filters
              type={type}
              statuses={statuses}
              q={q ?? ""}
              minBlocked={minBlocked}
              total={list.total}
            />
            <NodeList
              items={list.items}
              selectedId={selected}
              page={list.page}
              pageSize={list.pageSize}
              total={list.total}
            />
          </div>

          <DetailPanelShell selected={selected}>
            {selected ? (
              <Suspense fallback={<EmptyDetailPanel />}>
                <DetailPanel key={selected} nodeId={selected} />
              </Suspense>
            ) : (
              <EmptyDetailPanel />
            )}
          </DetailPanelShell>
        </div>
      </div>
    </main>
  );
}
