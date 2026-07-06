"use client";

import { useCallback, useSyncExternalStore } from "react";

import { useAnalytics } from "@/lib/hooks/use-analytics";
import { cn } from "@/lib/utils";

import { useFeatureFlag } from "./use-feature-flag";

// Per-vacancy up/down sentiment, mirrored across every mounted vote button via
// one module-level store (like lib/hooks/use-saved.ts). Anonymous + disposable:
// the real signal lives in PostHog; this only keeps the button pressed and
// stops a reload from double-counting.

type Sentiment = "up" | "down";
type Votes = Record<string, Sentiment>;

const KEY = "metahunt.votes";
const VERSION = 1;
const EMPTY: Votes = {};

function read(): Votes {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const p = JSON.parse(raw);
    if (p?.version !== VERSION || typeof p.votes !== "object" || p.votes === null)
      return EMPTY;
    return p.votes as Votes;
  } catch {
    return EMPTY;
  }
}

let cache: Votes = typeof window !== "undefined" ? read() : EMPTY;
const listeners = new Set<() => void>();

function set(next: Votes) {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ version: VERSION, votes: next }));
  } catch {
    /* quota / private mode — in-memory only */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function useVotes() {
  return useSyncExternalStore(
    subscribe,
    () => cache,
    () => EMPTY,
  );
}

export function VacancyFeedback({ vacancyId }: { vacancyId: string }) {
  const on = useFeatureFlag("feedback-buttons");
  const votes = useVotes();
  const analytics = useAnalytics();
  const current = votes[vacancyId];

  // Mutually exclusive; same-vote clicks are a no-op so we count each sentiment
  // change exactly once.
  const vote = useCallback(
    (sentiment: Sentiment) => {
      if (cache[vacancyId] === sentiment) return;
      set({ ...cache, [vacancyId]: sentiment });
      analytics.vacancyFeedback(vacancyId, sentiment);
    },
    [vacancyId, analytics],
  );

  if (!on) return null;

  const btn = "flex h-6 w-6 items-center justify-center border border-border-strong font-mono text-xs leading-none transition-colors";

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="Interested"
        aria-pressed={current === "up"}
        onClick={() => vote("up")}
        className={cn(
          btn,
          current === "up" ? "bg-success text-bg" : "text-text-muted hover:text-text-primary",
        )}
      >
        ▲
      </button>
      <button
        type="button"
        aria-label="Not interested"
        aria-pressed={current === "down"}
        onClick={() => vote("down")}
        className={cn(
          btn,
          current === "down" ? "bg-danger text-bg" : "text-text-muted hover:text-text-primary",
        )}
      >
        ▼
      </button>
    </div>
  );
}
