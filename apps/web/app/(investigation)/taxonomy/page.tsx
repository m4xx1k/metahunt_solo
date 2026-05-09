import {
  taxonomyApi,
  type NodeQueue,
  type NodeType,
} from "@/lib/api/taxonomy";
import { InvestigationHeader } from "../_components/InvestigationHeader";
import { Tag } from "@/components/ui-kit";
import { CoveragePanel } from "./_components/CoveragePanel";
import { QueueTabs } from "./_components/QueueTabs";

export const dynamic = "force-dynamic";

// Backend caps at QUEUE_MAX=200; we ask for 100 per axis to give the
// client-side filter useful headroom without inflating page weight.
const QUEUE_LIMIT = 100;

const EMPTY_QUEUE = (type: NodeType): NodeQueue => ({ type, items: [] });

export default async function TaxonomyPage() {
  const [coverage, roleQ, skillQ, domainQ] = await Promise.all([
    taxonomyApi.coverage().catch(() => null),
    taxonomyApi
      .queue("ROLE", QUEUE_LIMIT)
      .catch(() => EMPTY_QUEUE("ROLE")),
    taxonomyApi
      .queue("SKILL", QUEUE_LIMIT)
      .catch(() => EMPTY_QUEUE("SKILL")),
    taxonomyApi
      .queue("DOMAIN", QUEUE_LIMIT)
      .catch(() => EMPTY_QUEUE("DOMAIN")),
  ]);

  const queues: Record<NodeType, NodeQueue> = {
    ROLE: roleQ,
    SKILL: skillQ,
    DOMAIN: domainQ,
  };

  return (
    <main className="flex min-h-screen flex-col bg-bg">
      <InvestigationHeader title="taxonomy" />

      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-12 px-6 py-10 md:px-20">
        <div className="flex flex-col gap-2">
          <Tag>&gt; taxonomy</Tag>
          <h2 className="font-display text-2xl font-bold text-text-primary md:text-3xl">
            coverage and curation queue
          </h2>
          <p className="font-mono text-xs text-text-muted">
            read-only · phase 2 lands the moderation actions
          </p>
        </div>

        {coverage === null ? (
          <p className="border border-danger bg-bg-card p-4 font-mono text-sm text-danger">
            taxonomy coverage api is unavailable — left pane empty
          </p>
        ) : null}

        <div className="grid gap-10 lg:grid-cols-[2fr_3fr]">
          {coverage ? (
            <CoveragePanel coverage={coverage} />
          ) : (
            <div className="font-mono text-sm text-text-muted">no data</div>
          )}

          <div className="flex flex-col gap-2">
            <Tag>&gt; queue</Tag>
            <h3 className="font-display text-xl font-bold text-text-primary">
              NEW nodes · sorted by vacancies blocked
            </h3>
            <QueueTabs queues={queues} pageSize={QUEUE_LIMIT} />
          </div>
        </div>
      </div>
    </main>
  );
}
