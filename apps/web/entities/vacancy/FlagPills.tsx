import { FlagPill } from "./FlagPill";

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
  const pills: Array<{ label: string; value: string; tone: "ok" | "warn" }> =
    [];

  if (hasTestAssignment === true) {
    pills.push({ label: "test task", value: "yes", tone: "warn" });
  } else if (hasTestAssignment === false) {
    pills.push({ label: "test task", value: "no", tone: "ok" });
  }
  if (hasReservation === true) {
    pills.push({ label: "reservation", value: "yes", tone: "ok" });
  }

  if (pills.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {pills.map((p) => (
        <FlagPill key={p.label} label={p.label} value={p.value} tone={p.tone} />
      ))}
    </div>
  );
}
