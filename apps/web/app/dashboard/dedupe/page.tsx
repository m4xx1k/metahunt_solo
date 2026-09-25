import type { Metadata } from "next";

import { dedupApi } from "@/lib/api/dedup";
import {
  booleanSearchParam,
  flattenSearchParams,
  nonNegativeIntegerSearchParam,
} from "@/lib/search-params";
import { formatCount, formatPercent } from "@/lib/format";
import { StatCard } from "@/ui/data/StatCard";
import { StatGrid } from "@/ui/data/StatGrid";
import { EmptyState } from "@/ui/feedback/EmptyState";
import { FilterToggles } from "@/ui/inputs/FilterToggles";
import { PageBody } from "@/ui/layout/PageBody";
import { PageHeader } from "@/ui/layout/PageHeader";
import { BackLink } from "@/ui/navigation/BackLink";
import { Pagination } from "@/ui/navigation/Pagination";
import { GroupCard } from "./_components/GroupCard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dedupe" };

const PAGE_SIZE = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// One group per real position, with every source posting that got merged into it.
export default async function DedupePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const crossSource = booleanSearchParam(sp.crossSource);
  const groupId = typeof sp.group === "string" && UUID.test(sp.group) ? sp.group : undefined;
  const offset = nonNegativeIntegerSearchParam(sp.offset);

  const data = await dedupApi.list({
    crossSource: crossSource || undefined,
    groupId,
    page: Math.floor(offset / PAGE_SIZE) + 1,
    pageSize: PAGE_SIZE,
  });

  const flatSearchParams = flattenSearchParams(sp);
  const { metrics } = data;

  return (
    <>
      <PageHeader title="Dedupe" hint={`${formatCount(data.pagination.total)} groups match`} />

      <PageBody>
        <StatGrid cols={4}>
          <StatCard
            label="analysed"
            value={formatCount(metrics.totalVacancies)}
            hint="silver postings compared"
            href="/dashboard/vacancies"
          />
          <StatCard
            label="unique"
            value={formatCount(metrics.totalGroups)}
            hint="distinct positions"
          />
          <StatCard
            label="cross-source"
            value={formatCount(metrics.crossSourceGroups)}
            hint={`${formatPercent(metrics.crossSourceGroups, metrics.totalGroups)} of groups`}
            tone="accent"
          />
          <StatCard
            label="avg group"
            value={metrics.avgGroupSize.toFixed(2)}
            hint="postings per position"
          />
        </StatGrid>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {groupId ? <BackLink href="/dashboard/dedupe">all groups</BackLink> : null}
          <FilterToggles
            basePath="/dashboard/dedupe"
            searchParams={flatSearchParams}
            toggles={[
              {
                key: "crossSource",
                offLabel: "all groups",
                onLabel: "cross-source only",
                active: crossSource,
              },
            ]}
          />
        </div>

        {data.items.length === 0 ? (
          <EmptyState title="no groups match these filters" hint="turn off cross-source only." />
        ) : (
          <div className="flex flex-col gap-3">
            {data.items.map((group) => (
              <GroupCard key={group.id} group={group} open={groupId !== undefined} />
            ))}
          </div>
        )}

        <Pagination
          total={data.pagination.total}
          limit={PAGE_SIZE}
          offset={offset}
          basePath="/dashboard/dedupe"
          searchParams={flatSearchParams}
        />
      </PageBody>
    </>
  );
}
