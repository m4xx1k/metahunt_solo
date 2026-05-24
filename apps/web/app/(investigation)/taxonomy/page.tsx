import { Suspense } from "react";
import {
  taxonomyApi,
  type NodeListResult,
  type NodeStatus,
  type NodeType,
  type TaxonomyCoverage,
} from "@/lib/api/taxonomy";
import { Tag } from "@/components/ui-kit";
import { InvestigationHeader } from "../_components/InvestigationHeader";
import { AnalyticsStrip } from "./_components/AnalyticsStrip";
import { Filters } from "./_components/Filters";
import { NodeList } from "./_components/NodeList";
import { DetailPanel, EmptyDetailPanel } from "./_components/DetailPanel";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const DEFAULT_STATUSES: NodeStatus[] = ["NEW", "VERIFIED"];
const VALID_TYPES = new Set<NodeType>(["ROLE", "SKILL", "DOMAIN"]);
const VALID_STATUSES = new Set<NodeStatus>(["NEW", "VERIFIED", "HIDDEN"]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMPTY_LIST: NodeListResult = {
  items: [],
  page: 1,
  pageSize: PAGE_SIZE,
  total: 0,
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function TaxonomyPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const type = parseType(asString(sp.type));
  const statuses = parseStatuses(asString(sp.status));
  const q = asString(sp.q)?.trim() || undefined;
  const minBlocked = parseNonNegativeInt(asString(sp.blocked));
  const page = parsePositiveInt(asString(sp.page), 1);
  const selected = parseUuid(asString(sp.selected));

  const [coverage, list] = await Promise.all([
    taxonomyApi.coverage().catch((): TaxonomyCoverage | null => null),
    taxonomyApi
      .list({ type, statuses, q, blocked: minBlocked, page, pageSize: PAGE_SIZE })
      .catch((): NodeListResult => EMPTY_LIST),
  ]);

  return (
    <main className="flex min-h-screen flex-col bg-bg">
      <InvestigationHeader title="довідник понять" activePath="/taxonomy" />

      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-6 py-8 md:px-12">
        <div className="flex flex-col gap-2">
          <Tag>&gt; робоче місце куратора</Tag>
          <h2 className="font-display text-2xl font-bold text-text-primary md:text-3xl">
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

          <div className="lg:sticky lg:top-4 lg:self-start">
            {selected ? (
              <Suspense fallback={<EmptyDetailPanel />}>
                <DetailPanel key={selected} nodeId={selected} />
              </Suspense>
            ) : (
              <EmptyDetailPanel />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function asString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function parseType(raw: string | undefined): NodeType | undefined {
  if (!raw) return undefined;
  const upper = raw.toUpperCase() as NodeType;
  return VALID_TYPES.has(upper) ? upper : undefined;
}

function parseStatuses(raw: string | undefined): NodeStatus[] {
  if (!raw) return DEFAULT_STATUSES;
  const parts = raw
    .split(",")
    .map((p) => p.trim().toUpperCase())
    .filter((p): p is NodeStatus =>
      VALID_STATUSES.has(p as NodeStatus),
    );
  return parts.length > 0 ? parts : DEFAULT_STATUSES;
}

function parseNonNegativeInt(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : fallback;
}

function parseUuid(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return UUID_RE.test(raw) ? raw : undefined;
}
