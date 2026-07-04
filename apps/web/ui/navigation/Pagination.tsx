import Link from "next/link";
import { cn } from "@/lib/utils";

// Offset/limit pager (tier-2). Two modes:
//   link (server pages): pass `basePath` + `searchParams` → renders <Link>s that
//     carry `?offset=` in the URL.
//   callback (client islands like reverse-ATS): pass `onNavigate(offset)` →
//     renders <button>s that drive local state instead of navigating.
// `onNavigate` takes precedence when provided.
export function Pagination({
  total,
  limit,
  offset,
  basePath,
  searchParams,
  onNavigate,
}: {
  total: number;
  limit: number;
  offset: number;
  basePath?: string;
  searchParams?: Record<string, string | undefined>;
  onNavigate?: (offset: number) => void;
}) {
  if (total <= limit) return null;

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);
  const hasPrev = offset > 0;
  const hasNext = offset + limit < total;
  const prevOffset = Math.max(0, offset - limit);
  const nextOffset = offset + limit;

  function buildHref(target: number) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams ?? {})) {
      if (v !== undefined && v !== "" && k !== "offset") sp.set(k, v);
    }
    if (target > 0) sp.set("offset", String(target));
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : (basePath ?? "");
  }

  const linkBase =
    "inline-flex items-center px-3 py-2 font-mono text-xs uppercase tracking-wider border border-border bg-bg-card";
  const enabled = "hover:bg-bg-elev hover:text-accent";
  const disabled = "opacity-40 pointer-events-none";

  function cell(label: string, target: number, enabledNow: boolean) {
    const className = cn(linkBase, enabledNow ? enabled : disabled);
    if (onNavigate) {
      return (
        <button
          type="button"
          disabled={!enabledNow}
          onClick={() => onNavigate(target)}
          className={className}
        >
          {label}
        </button>
      );
    }
    return (
      <Link href={buildHref(target)} className={className} aria-disabled={!enabledNow}>
        {label}
      </Link>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <p className="font-mono text-xs text-text-muted">
        showing {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-2">
        {cell("← prev", prevOffset, hasPrev)}
        {cell("next →", nextOffset, hasNext)}
      </div>
    </div>
  );
}
