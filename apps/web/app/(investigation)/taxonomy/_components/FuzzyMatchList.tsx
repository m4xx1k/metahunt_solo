import type { FuzzyMatch, NodeStatus } from "@/lib/api/taxonomy";
import { cn } from "@/lib/utils";

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

export function FuzzyMatchList({
  matches,
  skippedReason,
  onMerge,
  mergeDisabled,
}: {
  matches: FuzzyMatch[];
  skippedReason?: string;
  onMerge?: (targetId: string) => void;
  mergeDisabled?: boolean;
}) {
  if (skippedReason) {
    return (
      <div className="flex flex-col gap-1 border border-border bg-bg-elev p-3 font-mono text-xs text-text-muted">
        <span className="font-bold text-text-secondary">
          пошук схожих пропущено
        </span>
        <span>назва занадто коротка для надійного зіставлення</span>
      </div>
    );
  }
  if (matches.length === 0) {
    return (
      <p className="font-mono text-xs text-text-muted">
        схожих понять не знайдено
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-border border border-border bg-bg-elev">
      {matches.map((m) => (
        <li
          key={m.id}
          className="grid grid-cols-[1fr_84px_56px_auto] items-center gap-3 px-3 py-2 font-mono text-xs"
        >
          <span className="truncate text-text-primary" title={m.canonicalName}>
            {m.canonicalName}
          </span>
          <span
            className={cn(
              "border px-2 py-[1px] text-center text-[10px] uppercase tracking-wider",
              STATUS_PILL[m.status],
            )}
          >
            {STATUS_LABEL[m.status]}
          </span>
          <span className="text-right text-text-muted">
            {m.similarity.toFixed(2)}
          </span>
          {onMerge ? (
            <button
              type="button"
              disabled={mergeDisabled}
              onClick={() => {
                if (
                  confirm(
                    `Об'єднати поточне поняття у «${m.canonicalName}»? Усі посилання перенесуться, поточне видалиться, його назва стане псевдонімом цільового.`,
                  )
                ) {
                  onMerge(m.id);
                }
              }}
              className={cn(
                "border px-2 py-1 text-[10px] uppercase tracking-wider transition-colors",
                mergeDisabled
                  ? "border-border text-text-muted"
                  : "border-accent text-accent hover:bg-accent hover:text-bg",
              )}
            >
              об'єднати →
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
