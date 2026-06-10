"use client";

import { cn } from "@/lib/utils";
import { Section } from "@/components/data/filters/Section";

// PerksFilter — the two market "perks" (бронь, тестове) merged into a single
// two-column quick-filter row, styled to mirror the card pills in
// VacancyCard. Framed the way candidates read them: reservation as a draw
// ("бронь") and the test task by its desirable absence ("без тесту").
//
// Each pill is an independent on/off toggle: active → the meaningful filter,
// click again → cleared (any). No tri-state — "show only WITH a test task" is a
// non-goal, so reservation toggles true⇄null and test toggles false⇄null. The
// "без тесту" filter (false) also matches unscored vacancies (null) — the
// backend treats "no test" as "not confirmed-true" (see feed.service buildWhere).
export function PerksFilter({
  reservation,
  test,
  onReservation,
  onTest,
}: {
  reservation: boolean | null;
  test: boolean | null;
  onReservation: (v: boolean | null) => void;
  onTest: (v: boolean | null) => void;
}) {
  const reservationOn = reservation === true;
  const testOn = test === false;
  const summary =
    [reservationOn ? "бронь" : null, testOn ? "без тесту" : null]
      .filter(Boolean)
      .join(" · ") || "any";

  return (
    <Section title="perks" summary={summary}>
      <div className="grid grid-cols-2 gap-2">
        <PerkPill
          icon="🛡"
          label="бронь"
          active={reservationOn}
          onClick={() => onReservation(reservationOn ? null : true)}
        />
        <PerkPill
          icon="🧪"
          label="без тесту"
          active={testOn}
          onClick={() => onTest(testOn ? null : false)}
        />
      </div>
    </Section>
  );
}

function PerkPill({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex w-full items-center justify-center gap-2 border px-3 py-1.5 font-mono text-xs transition-colors",
        active
          ? "border-success bg-success/10 text-success"
          : "border-border text-text-secondary hover:border-success/60 hover:text-text-primary",
      )}
    >
      <span aria-hidden>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
