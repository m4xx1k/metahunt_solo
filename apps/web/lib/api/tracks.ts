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
// track's own criteria.

export interface ContextualSkill {
  id: string;
  name: string;
  count: number;
}

export interface ContextualSkillsResponse {
  skills: ContextualSkill[];
}

// ─────────────────────────── Fetcher ────────────────────────────

export const tracksApi = {
  get: () => apiGet<TracksResponse>("/vacancies/tracks"),
  skills: (slug: string) =>
    apiGet<ContextualSkillsResponse>(
      `/vacancies/tracks/${encodeURIComponent(slug)}/skills`,
    ),
};
