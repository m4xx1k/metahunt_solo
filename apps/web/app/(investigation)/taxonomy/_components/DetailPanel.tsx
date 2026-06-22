import {
  taxonomyApi,
  type FuzzyMatchResult,
  type NodeDetail,
  type NodeStatus,
} from "@/lib/api/taxonomy";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { ModerationActions } from "./ModerationActions";
import { AliasList } from "./AliasList";
import { FuzzyMatchList } from "./FuzzyMatchList";
import { VerifiedSearch } from "./VerifiedSearch";

const STATUS_PILL: Record<NodeStatus, string> = {
  VERIFIED: "border-success text-success",
  NEW: "border-accent text-accent",
  HIDDEN: "border-text-muted text-text-muted",
};

const STATUS_LABEL: Record<NodeStatus, string> = {
  VERIFIED: "підтверджено",
  NEW: "нове",
  HIDDEN: "приховано",
};

// Server Component. Fetches node detail + fuzzy matches in parallel when
// the URL has ?selected=<id>. Interactive bits (moderation buttons, merge
// targets, verified search) are isolated as child Client components.
export async function DetailPanel({ nodeId }: { nodeId: string }) {
  let node: NodeDetail | null = null;
  let fuzzy: FuzzyMatchResult | null = null;
  let error: string | null = null;

  try {
    [node, fuzzy] = await Promise.all([
      taxonomyApi.node(nodeId),
      taxonomyApi.fuzzyMatches(nodeId),
    ]);
  } catch (e: unknown) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (error || !node || !fuzzy) {
    return (
      <PanelShell>
        <pre className="overflow-x-auto whitespace-pre-wrap border border-danger bg-bg p-3 font-mono text-xs text-danger">
          {error ?? "поняття не знайдено"}
        </pre>
      </PanelShell>
    );
  }

  return (
    <PanelShell>
      <div className="flex flex-col gap-2">
        <h2 className="break-words font-display text-2xl font-bold text-text-primary">
          {node.canonicalName}
        </h2>
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          <span
            className={cn(
              "border px-2 py-[2px] uppercase tracking-wider",
              STATUS_PILL[node.status],
            )}
          >
            {STATUS_LABEL[node.status]}
          </span>
          <span className="border border-border px-2 py-[2px] uppercase tracking-wider text-text-muted">
            {node.type}
          </span>
          <span className="text-text-muted">
            створено · {formatDateTime(node.createdAt)}
          </span>
        </div>
      </div>

      <ModerationActions node={node} />

      <Section label={`псевдоніми · ${node.aliases.length}`}>
        <AliasList aliases={node.aliases} />
      </Section>

      <Section label={`згадується у · ${node.vacancyCount} вакансій`}>
        {node.sampleVacancies.length === 0 ? (
          <p className="font-mono text-xs text-text-muted">прикладів немає</p>
        ) : (
          <ul className="flex flex-col gap-1 font-mono text-xs">
            {node.sampleVacancies.map((v) => (
              <li
                key={v.id}
                className="flex items-baseline gap-2 truncate"
                title={v.title}
              >
                <span className="text-text-muted">[{v.sourceCode}]</span>
                <span className="truncate text-text-secondary">{v.title}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section label="схожі підтверджені поняття">
        <FuzzyMatchList
          sourceId={node.id}
          matches={fuzzy.matches}
          skippedReason={fuzzy.skippedReason}
        />
      </Section>

      <Section label="пошук серед підтверджених для об'єднання">
        <VerifiedSearch sourceId={node.id} type={node.type} />
      </Section>
    </PanelShell>
  );
}

export function EmptyDetailPanel() {
  return (
    <PanelShell>
      <p className="font-mono text-sm text-text-muted">
        оберіть поняття зі списку зліва для деталей і дій модератора
      </p>
    </PanelShell>
  );
}

function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <aside className="flex flex-col gap-5 border border-border bg-bg-card p-5">
      <span className="font-mono text-2xs uppercase tracking-wider text-text-muted">
        поняття довідника
      </span>
      {children}
    </aside>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <span className="font-mono text-2xs uppercase tracking-wider text-text-muted">
        {label}
      </span>
      {children}
    </section>
  );
}
