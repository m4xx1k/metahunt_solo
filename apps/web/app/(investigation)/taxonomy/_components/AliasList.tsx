import type { NodeAlias } from "@/lib/api/taxonomy";
import { formatDateTime } from "@/lib/format";

export function AliasList({ aliases }: { aliases: NodeAlias[] }) {
  if (aliases.length === 0) {
    return <p className="font-mono text-xs text-text-muted">немає</p>;
  }
  return (
    <ul className="flex flex-wrap gap-2 font-mono text-xs">
      {aliases.map((a) => (
        <li
          key={a.name}
          className="border border-border bg-bg-elev px-2 py-1 text-text-secondary"
          title={`додано ${formatDateTime(a.createdAt)}`}
        >
          {a.name}
        </li>
      ))}
    </ul>
  );
}
