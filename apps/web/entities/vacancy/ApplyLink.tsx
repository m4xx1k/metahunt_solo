"use client";

import { useSyncExternalStore } from "react";

import { publicApiBase } from "@/lib/api/client";
import { getOrCreateJourneyId } from "@/lib/analytics-journey";

type Props = {
  vacancyId: string;
  sourceName: string;
};

// No live updates — the id is created once per browser and cached in module
// memory by getOrCreateJourneyId(); this just needs a stable subscribe ref.
function subscribe() {
  return () => {};
}

// Client leaf (VacancyCard stays a server component): the browser journey id
// lives in localStorage, unreadable during SSR, so `?j=` only appears once
// hydrated — useSyncExternalStore's server snapshot keeps that mismatch-safe.
export function ApplyLink({ vacancyId, sourceName }: Props) {
  const journeyId = useSyncExternalStore(subscribe, getOrCreateJourneyId, () => null);

  const href = `${publicApiBase()}/go/${vacancyId}${
    journeyId ? `?j=${encodeURIComponent(journeyId)}` : ""
  }`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="font-mono text-sm text-accent hover:underline"
    >
      ↗ original on {sourceName}
    </a>
  );
}
