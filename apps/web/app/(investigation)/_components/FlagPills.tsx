import { cn } from "@/lib/utils";

// Test-assignment / reservation pills shared by the investigation vacancy
// cards. Driven by the two booleans (data in, not markup) so each card —
// whether it holds a VacancyDto or an extracted record — passes its own
// fields.
export function FlagPills({
  hasTestAssignment,
  hasReservation,
}: {
  hasTestAssignment?: boolean | null;
  hasReservation?: boolean | null;
}) {
  const pills: Array<{
    label: string;
    value: string;
    tone: "ok" | "no" | "muted";
  }> = [];

  if (hasTestAssignment === true) {
    pills.push({ label: "тестове", value: "так", tone: "no" });
  } else if (hasTestAssignment === false) {
    pills.push({ label: "тестове", value: "ні", tone: "ok" });
  }
  if (hasReservation === true) {
    pills.push({ label: "бронювання", value: "так", tone: "ok" });
  }

  if (pills.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {pills.map((p) => (
        <span
          key={p.label}
          className={cn(
            "inline-flex items-center gap-2 border px-3 py-1 font-mono text-xs",
            p.tone === "ok" && "border-success text-success",
            p.tone === "no" && "border-danger text-danger",
            p.tone === "muted" && "border-border text-text-secondary",
          )}
        >
          <span className="text-[10px] uppercase tracking-wider text-text-muted">
            {p.label}:
          </span>
          <span className="font-bold">{p.value}</span>
        </span>
      ))}
    </div>
  );
}
