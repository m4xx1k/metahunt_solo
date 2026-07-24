"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { productAnalyticsApi } from "@/lib/api/product-analytics";

export type JourneyClassification = {
  id: string;
  isTest: boolean;
  cohortId: string | null;
};

// Operator-only classification: flipping a journey to `test` is how controlled
// runs get excluded from the production funnel.
export function JourneyActions({ journey }: { journey: JourneyClassification }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const busy = pending || saving;

  async function save(isTest: boolean, cohortId: string | null) {
    setSaving(true);
    try {
      await productAnalyticsApi.updateJourney(journey.id, { isTest, cohortId });
      startTransition(() => router.refresh());
    } catch {
      toast.error("could not update this journey");
    } finally {
      setSaving(false);
    }
  }

  function askCohort() {
    const cohortId = window.prompt("cohort id (optional, up to 64 chars):", journey.cohortId ?? "");
    if (cohortId === null) return;
    void save(true, cohortId.trim() || null);
  }

  return (
    <div className="flex justify-end gap-2">
      {journey.isTest ? (
        <ActionButton disabled={busy} onClick={askCohort}>
          cohort
        </ActionButton>
      ) : null}
      <ActionButton
        disabled={busy}
        onClick={() => (journey.isTest ? void save(false, null) : askCohort())}
      >
        {journey.isTest ? "→ prod" : "→ test"}
      </ActionButton>
    </div>
  );
}

function ActionButton({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="border border-border px-2 py-1 font-mono text-2xs uppercase tracking-[0.12em] text-text-secondary transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
    >
      {children}
    </button>
  );
}
