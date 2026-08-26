"use client";

import { useSyncExternalStore } from "react";

import { publicApiBase } from "@/lib/api/client";
import { getOrCreateJourneyId } from "@/lib/analytics/journey";
import { cn } from "@/lib/utils";

type Props = {
  vacancyId: string;
  sourceName: string;
  // "button" is the vacancy page's apply panel — the one place on that page
  // where applying is the primary action rather than one link among several.
  variant?: "link" | "button";
  className?: string;
};

// No live updates — the id is created once per browser and cached in module
// memory by getOrCreateJourneyId(); this just needs a stable subscribe ref.
function subscribe() {
  return () => {};
}

const VARIANTS = {
  link: "font-mono text-sm text-accent hover:underline",
  button:
    "inline-flex w-full items-center justify-center gap-2 border border-transparent bg-accent px-5 py-3 font-body text-sm font-semibold text-bg shadow-brut transition-[transform,box-shadow] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-brut-xs active:translate-x-[2px] active:translate-y-[2px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
} as const;

// Client leaf (VacancyCard stays a server component): the browser journey id
// lives in localStorage, unreadable during SSR, so `?j=` only appears once
// hydrated — useSyncExternalStore's server snapshot keeps that mismatch-safe.
export function ApplyLink({ vacancyId, sourceName, variant = "link", className }: Props) {
  const journeyId = useSyncExternalStore(subscribe, getOrCreateJourneyId, () => null);

  const href = `${publicApiBase()}/go/${vacancyId}${
    journeyId ? `?j=${encodeURIComponent(journeyId)}` : ""
  }`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(VARIANTS[variant], className)}
    >
      {variant === "button" ? `Відгукнутись на ${sourceName} ↗` : `↗ original on ${sourceName}`}
    </a>
  );
}
