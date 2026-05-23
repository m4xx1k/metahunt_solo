import type { IngestListItem } from "@/lib/api/monitoring";
import { ActivityRow } from "./ActivityRow";

export function ActivityStream({ items }: { items: IngestListItem[] }) {
  if (items.length === 0) {
    return (
      <p className="font-mono text-sm text-text-muted">
        активності ще немає — запустіть збір з ETL бекенду
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-border border border-border bg-bg-card">
      {items.map((item) => (
        <ActivityRow key={item.id} item={item} />
      ))}
    </ul>
  );
}
