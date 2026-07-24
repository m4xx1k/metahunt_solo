import type { Metadata } from "next";
import { Suspense } from "react";

import { taxonomyApi, type NodeListResult, type TaxonomyCoverage } from "@/lib/api/taxonomy";
import { PageBody } from "@/ui/layout/PageBody";
import { PageHeader } from "@/ui/layout/PageHeader";
import { AnalyticsStrip } from "./_components/AnalyticsStrip";
import { Filters } from "./_components/Filters";
import { NodeList } from "./_components/NodeList";
import { DetailPanel, EmptyDetailPanel } from "./_components/DetailPanel";
import { DetailPanelShell } from "./_components/DetailPanelShell";
import { parseTaxonomyPageState } from "./_lib/taxonomy-page-state";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Taxonomy" };

const PAGE_SIZE = 50;
const EMPTY_LIST: NodeListResult = { items: [], page: 1, pageSize: PAGE_SIZE, total: 0 };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Curator workspace: filters + list on the left, detail and moderation on the
// right. Every bit of state is serialised into the URL.
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
    <>
      <PageHeader title="Taxonomy" hint="roles, skills and domains · curation queue" />

      <PageBody>
        <AnalyticsStrip coverage={coverage} />

        <div className="grid gap-3 lg:grid-cols-[3fr_2fr]">
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
      </PageBody>
    </>
  );
}
