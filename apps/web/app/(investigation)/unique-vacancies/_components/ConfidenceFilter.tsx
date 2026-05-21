import Link from "next/link";
import { cn } from "@/lib/utils";

type Confidence = "all" | "gold" | "confirmed";

// Mutually-exclusive 3-option chip selector for the confidence filter.
// Built as <Link>s so it stays a server component and bookmarks/shareables
// preserve state.
export function ConfidenceFilter({
  basePath,
  searchParams,
  active,
}: {
  basePath: string;
  searchParams: Record<string, string | undefined>;
  active: Confidence;
}) {
  const options: Array<{ key: Confidence; label: string }> = [
    { key: "all", label: "all" },
    { key: "gold", label: "gold only" },
    { key: "confirmed", label: "confirmed only" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
        &gt; confidence:
      </span>
      {options.map((o) => (
        <Link
          key={o.key}
          href={buildHref(basePath, searchParams, o.key)}
          aria-pressed={active === o.key}
          className={cn(
            "inline-flex items-center border px-3 py-1 font-mono text-xs uppercase tracking-wider",
            active === o.key
              ? "border-accent text-accent shadow-[3px_3px_0_0_#000]"
              : "border-border text-text-secondary hover:border-accent hover:text-accent",
          )}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

function buildHref(
  basePath: string,
  current: Record<string, string | undefined>,
  next: Confidence,
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    if (k === "confidence" || k === "offset") continue;
    if (v !== undefined && v !== "") sp.set(k, v);
  }
  if (next !== "all") sp.set("confidence", next);
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
