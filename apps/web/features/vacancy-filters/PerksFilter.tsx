"use client";

import { ClipboardList, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import { CollapsibleSection } from "@/ui/layout/CollapsibleSection";

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
    <CollapsibleSection title="perks" summary={summary}>
      <div className="grid grid-cols-2 gap-2">
        <PerkPill
          icon={<ShieldCheck className="h-3.5 w-3.5" strokeWidth={2.5} />}
          label="бронь"
          tone="ok"
          active={reservationOn}
          onClick={() => onReservation(reservationOn ? null : true)}
        />
        <PerkPill
          icon={<ClipboardList className="h-3.5 w-3.5" strokeWidth={2.5} />}
          label="без тесту"
          tone="info"
          active={testOn}
          onClick={() => onTest(testOn ? null : false)}
        />
      </div>
    </CollapsibleSection>
  );
}

// Tones mirror the card's flag pills: reservation = green (a draw), test
// concept = blue. Inactive stays neutral; active lights up in the tone.
const PERK_TONE = {
  ok: {
    active: "border-success bg-success/10 text-success",
    hover: "hover:border-success/60",
  },
  info: {
    active: "border-accent-secondary bg-accent-secondary/10 text-accent-secondary",
    hover: "hover:border-accent-secondary/60",
  },
} as const;

function PerkPill({
  icon,
  label,
  tone,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  tone: keyof typeof PERK_TONE;
  active: boolean;
  onClick: () => void;
}) {
  const t = PERK_TONE[tone];
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex w-full items-center justify-center gap-2 border px-3 py-1.5 font-mono text-xs transition-colors",
        active
          ? t.active
          : cn("border-border text-text-secondary hover:text-text-primary", t.hover),
      )}
    >
      <span aria-hidden>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
