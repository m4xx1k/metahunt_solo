"use client";

import { useCallback, useSyncExternalStore } from "react";

// Throwaway localStorage: recent uploaded CVs + created subscriptions + the
// active CV. Lets the CV tab stay unlocked across visits (1-click re-rank) and
// a saved CV/sub replay in one click. Anonymous + disposable — cleared when
// Telegram auth ships. Corrupt or old-version data resets to empty; caps evict
// the oldest. One module-level store so every useSaved() consumer stays in sync.

const KEY = "metahunt.saved";
const VERSION = 1;
const CV_CAP = 10;
const SUB_CAP = 20;

export interface SavedCv {
  candidateId: string;
  label: string;
  addedAt: number;
}

export interface SavedSub {
  id: string;
  lens: "cold" | "warm";
  label: string;
  /** URL query string to replay (filters, and ?cv for warm subs). */
  query: string;
  candidateId?: string;
  addedAt: number;
}

interface SavedState {
  version: number;
  cvs: SavedCv[];
  subs: SavedSub[];
  activeCv: string | null;
}

const EMPTY: SavedState = { version: VERSION, cvs: [], subs: [], activeCv: null };

function read(): SavedState {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const p = JSON.parse(raw);
    if (p?.version !== VERSION) return EMPTY;
    return {
      version: VERSION,
      cvs: Array.isArray(p.cvs) ? p.cvs : [],
      subs: Array.isArray(p.subs) ? p.subs : [],
      activeCv: typeof p.activeCv === "string" ? p.activeCv : null,
    };
  } catch {
    return EMPTY;
  }
}

let cache: SavedState = typeof window !== "undefined" ? read() : EMPTY;
const listeners = new Set<() => void>();

function set(next: SavedState) {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode — in-memory only */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useSaved() {
  const state = useSyncExternalStore(
    subscribe,
    () => cache,
    () => EMPTY,
  );

  const addCv = useCallback((cv: SavedCv) => {
    set({
      ...cache,
      activeCv: cv.candidateId,
      cvs: [cv, ...cache.cvs.filter((c) => c.candidateId !== cv.candidateId)].slice(0, CV_CAP),
    });
  }, []);

  const removeCv = useCallback((candidateId: string) => {
    set({
      ...cache,
      cvs: cache.cvs.filter((c) => c.candidateId !== candidateId),
      activeCv: cache.activeCv === candidateId ? null : cache.activeCv,
    });
  }, []);

  const setActiveCv = useCallback((candidateId: string | null) => {
    set({ ...cache, activeCv: candidateId });
  }, []);

  const addSub = useCallback((sub: SavedSub) => {
    set({ ...cache, subs: [sub, ...cache.subs.filter((s) => s.id !== sub.id)].slice(0, SUB_CAP) });
  }, []);

  const removeSub = useCallback((id: string) => {
    set({ ...cache, subs: cache.subs.filter((s) => s.id !== id) });
  }, []);

  return { ...state, addCv, removeCv, setActiveCv, addSub, removeSub };
}
