import type { NodeQueueItem } from "@/lib/api/taxonomy";
import { cn } from "@/lib/utils";

type Props = {
  item: NodeQueueItem;
  maxBlocked: number;
  onSelect: (id: string) => void;
  selected: boolean;
};

export function QueueRow({ item, maxBlocked, onSelect, selected }: Props) {
  const widthPct =
    maxBlocked > 0 ? (item.vacanciesBlocked / maxBlocked) * 100 : 0;

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(item.id)}
        className={cn(
          "grid w-full grid-cols-[1fr_64px_120px] items-center gap-3 border-l-2 px-3 py-2 text-left font-mono text-sm transition-colors",
          selected
            ? "border-accent bg-bg-elev text-accent"
            : "border-transparent text-text-secondary hover:border-border hover:text-text-primary",
        )}
      >
        <span className="truncate">{item.canonicalName}</span>
        <span className="text-right text-text-muted">
          {item.vacanciesBlocked}
        </span>
        <div className="h-2 w-full bg-bg-card">
          <div
            className="h-full bg-accent"
            style={{ width: `${widthPct}%` }}
            aria-hidden="true"
          />
        </div>
      </button>
    </li>
  );
}
