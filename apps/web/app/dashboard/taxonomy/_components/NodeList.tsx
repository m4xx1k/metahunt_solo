import type { NodeListItem } from "@/lib/api/taxonomy";
import { NodeRow } from "./NodeRow";
import { ListPagination } from "./ListPagination";

type Props = {
  items: NodeListItem[];
  selectedId: string | undefined;
  page: number;
  pageSize: number;
  total: number;
};

export function NodeList({ items, selectedId, page, pageSize, total }: Props) {
  if (items.length === 0) {
    return (
      <p className="border border-border bg-bg-card p-6 font-mono text-sm text-text-muted">
        no entries match these filters
      </p>
    );
  }

  const maxBlocked = items.reduce((m, it) => Math.max(m, it.vacanciesBlocked), 0);

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex max-h-[60dvh] flex-col gap-[2px] overflow-y-auto border border-border bg-bg-card sm:max-h-[640px]">
        {items.map((item) => (
          <NodeRow
            key={item.id}
            item={item}
            maxBlocked={maxBlocked}
            selected={selectedId === item.id}
          />
        ))}
      </ul>
      <ListPagination page={page} pageSize={pageSize} total={total} />
    </div>
  );
}
