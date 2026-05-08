import Link from "next/link";
import { cn } from "@/lib/utils";

interface Toggle {
  /** URL searchParam key. */
  key: string;
  /** Label shown when the toggle is OFF (default behavior). */
  offLabel: string;
  /** Label shown when the toggle is ON (override active). */
  onLabel: string;
  /** Current state derived from searchParams. */
  active: boolean;
}

export function FilterToggles({
  toggles,
  basePath,
  searchParams,
}: {
  toggles: Toggle[];
  basePath: string;
  searchParams: Record<string, string | undefined>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
        &gt; filters:
      </span>
      {toggles.map((t) => (
        <Link
          key={t.key}
          href={buildHref(basePath, searchParams, t.key, t.active)}
          aria-pressed={t.active}
          className={cn(
            "inline-flex items-center gap-2 border px-3 py-1 font-mono text-xs uppercase tracking-wider",
            t.active
              ? "border-accent text-accent shadow-[3px_3px_0_0_#000]"
              : "border-border text-text-secondary hover:border-accent hover:text-accent",
          )}
        >
          <span aria-hidden>{t.active ? "[x]" : "[ ]"}</span>
          {t.active ? t.onLabel : t.offLabel}
        </Link>
      ))}
    </div>
  );
}

function buildHref(
  basePath: string,
  current: Record<string, string | undefined>,
  toggleKey: string,
  isActive: boolean,
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    // Reset paging on filter change so we don't land past the new total.
    if (k === toggleKey || k === "offset") continue;
    if (v !== undefined && v !== "") sp.set(k, v);
  }
  if (!isActive) sp.set(toggleKey, "true");
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
