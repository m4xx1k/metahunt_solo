// Web-side wire types + fetcher for the tracks browse tree.
// Source of truth: apps/etl/src/vacancies/vacancies.contract.ts.
// Hand-mirrored per ADR-0005 (no shared libs/contracts/ until 2nd consumer).
// See md/journal/migrations/taxonomy-navigation.md for the model.

import { apiGet } from "./client";

// ───────────────────────── Browse tree ─────────────────────────
// One flat list; the web nests it by `parentSlug`. Counts are per track
// and inherited (a child's count == what clicking it returns); never sum.

export interface TrackDto {
  slug: string;
  label: string;
  /** Null for top-level disciplines; the discipline's slug for children. */
  parentSlug: string | null;
  count: number;
  sortOrder: number;
}

export interface TracksResponse {
  tracks: TrackDto[];
}

// ─────────────────── Contextual skills (PR#2) ───────────────────
// Skills most common in a track's matched vacancies, excluding the
// track's own preset.

export interface ContextualSkill {
  id: string;
  name: string;
  count: number;
}

export interface ContextualSkillsResponse {
  skills: ContextualSkill[];
}

// ─────────────────── Track preset (both axes) ───────────────────
// The ROLE + SKILL nodes a track resolves to (own axis, else inherited
// one hop). Both render as the unified facet panels' preset chips — on by
// default; toggle to narrow, search to widen. Empty arrays = pure grouping.

export interface TrackNode {
  id: string;
  name: string;
}

export interface TrackPresetResponse {
  roles: TrackNode[];
  skills: TrackNode[];
}

// ─────────────────────────── Fetcher ────────────────────────────

// ISR-cache: the track tree + per-track preset/contextual-skills change only
// on the hourly RSS ingest, never on a skill/role toggle. The page re-runs on
// every toggle (URL change), so without this each chip click recomputes the
// tracks count view (~340ms) and re-hits the backend for data that didn't move.
const ISR = { next: { revalidate: 60 } } satisfies RequestInit;

export const tracksApi = {
  get: () => apiGet<TracksResponse>("/vacancies/tracks", ISR),
  skills: (slug: string) =>
    apiGet<ContextualSkillsResponse>(
      `/vacancies/tracks/${encodeURIComponent(slug)}/skills`,
      ISR,
    ),
  preset: (slug: string) =>
    apiGet<TrackPresetResponse>(
      `/vacancies/tracks/${encodeURIComponent(slug)}/preset`,
      ISR,
    ),
};
