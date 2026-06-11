import { cn } from "@/lib/utils";

// Single status pill (test assignment / reservation). Cards compose these
// per context: the feed card adds icons and its own labels, the
// investigation cards render the boolean-driven FlagPills row.
export function FlagPill({
  icon,
  label,
  value,
  tone,
}: {
  icon?: string;
  label: string;
  value: string;
  tone: "ok" | "warn" | "muted";
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-2 border px-3 py-1 font-mono text-xs",
        tone === "ok" && "border-success text-success",
        tone === "warn" && "border-danger text-danger",
        tone === "muted" && "border-border text-text-secondary",
      )}
    >
      {icon ? <span aria-hidden>{icon}</span> : null}
      <span className="text-[10px] uppercase tracking-wider text-text-muted">
        {label}:
      </span>
      <span className="font-bold">{value}</span>
    </span>
  );
}
