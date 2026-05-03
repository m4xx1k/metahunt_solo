import Link from "next/link";
import { cn } from "@/lib/utils";

export function Pagination({
  total,
  limit,
  offset,
  basePath,
  searchParams,
}: {
  total: number;
  limit: number;
  offset: number;
  basePath: string;
  searchParams: Record<string, string | undefined>;
}) {
  if (total <= limit) return null;

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);
  const hasPrev = offset > 0;
  const hasNext = offset + limit < total;

  function buildHref(nextOffset: number) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (v !== undefined && v !== "" && k !== "offset") sp.set(k, v);
    }
    if (nextOffset > 0) sp.set("offset", String(nextOffset));
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  const linkBase =
    "inline-flex items-center px-3 py-2 font-mono text-xs uppercase tracking-wider border border-border bg-bg-card";
  const enabled = "hover:bg-bg-elev hover:text-accent";
  const disabled = "opacity-40 pointer-events-none";

  return (
    <div className="flex items-center justify-between gap-4">
      <p className="font-mono text-xs text-text-muted">
        showing {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-2">
        <Link
          href={buildHref(Math.max(0, offset - limit))}
          className={cn(linkBase, hasPrev ? enabled : disabled)}
          aria-disabled={!hasPrev}
        >
          ← prev
        </Link>
        <Link
          href={buildHref(offset + limit)}
          className={cn(linkBase, hasNext ? enabled : disabled)}
          aria-disabled={!hasNext}
        >
          next →
        </Link>
      </div>
    </div>
  );
}
