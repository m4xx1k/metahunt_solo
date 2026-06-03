// Wire contract for the tracks (browse-tree) HTTP API. Kept free of NestJS /
// Drizzle imports so the web client can mirror these types directly.

import type { NodeRef } from "../shared/contract";

// The single user-facing browse tree (disciplines + stack/sub-discipline
// children). One flat list the web nests by `parentSlug`. Counts are per
// track and inherited (a child's count == what clicking it returns); never
// sum them. See md/journal/migrations/taxonomy-navigation.md.
export interface TrackDto {
  slug: string;
  label: string;
  /** Null for top-level disciplines; the discipline's slug for children. */
  parentSlug: string | null;
  /** Eligible vacancies matched by this track (from the track_counts view). */
  count: number;
  sortOrder: number;
}

export interface TracksResponse {
  tracks: TrackDto[];
}

// The effective preset a track resolves to, per axis (own nodes, else
// inherited from the parent — one hop). Both axes power the unified facet
// panels: the preset is shown on by default, the user toggles/adds to refine.
// A pure-grouping track returns empty arrays. See override-else-inherit in
// md/journal/migrations/taxonomy-navigation.md.
export interface TrackPresetResponse {
  roles: NodeRef[];
  skills: NodeRef[];
}

// Skills most common in a track's matched vacancies, excluding its own preset.
export interface ContextualSkill {
  id: string;
  name: string;
  count: number;
}

export interface ContextualSkillsResponse {
  skills: ContextualSkill[];
}
