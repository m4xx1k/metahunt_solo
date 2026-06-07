import { inArray, sql, type SQL } from "drizzle-orm";

import { schema } from "@metahunt/database";

import { uuidList } from "../../platform/shared/sql";

const { vacancies } = schema;

// A track's effective node selection — the ROLE and SKILL node ids it filters
// vacancies by. An empty array on an axis means "no constraint there"; both
// empty means a pure-grouping track (e.g. "By Language") that matches nothing.
export interface TrackPreset {
  roleIds: string[];
  skillIds: string[];
}

// What a track carries before resolution: its own nodes split by axis, plus
// its parent's (one hop up the browse tree). resolveTrackPreset turns this
// into the effective preset.
export interface TrackNodeIds {
  own: TrackPreset;
  parent: TrackPreset;
}

// Per-axis override-else-inherit: a track filters by its own nodes of an axis,
// or — if it declares none — its parent's. The two axes resolve independently,
// so a stack child (own SKILL, no ROLE) inherits the discipline's roles while
// overriding skills. The single source of truth for what a track means; the
// track_counts view mirrors this same rule in SQL.
export function resolveTrackPreset({ own, parent }: TrackNodeIds): TrackPreset {
  return {
    roleIds: own.roleIds.length > 0 ? own.roleIds : parent.roleIds,
    skillIds: own.skillIds.length > 0 ? own.skillIds : parent.skillIds,
  };
}

export function presetMatchesNothing(preset: TrackPreset): boolean {
  return preset.roleIds.length === 0 && preset.skillIds.length === 0;
}

// The vacancy WHERE condition a preset applies, identical for the feed and its
// count so a track's shown number equals what clicking it returns: the role is
// ANY of the role ids, and the vacancy carries ANY of the skill ids. An empty
// axis drops out; an empty preset matches nothing (mirrors the view's 0 count).
export function presetCondition(preset: TrackPreset): SQL {
  if (presetMatchesNothing(preset)) return sql`false`;
  const conds: SQL[] = [];
  if (preset.roleIds.length > 0) {
    conds.push(inArray(vacancies.roleNodeId, preset.roleIds));
  }
  if (preset.skillIds.length > 0) {
    conds.push(sql`EXISTS (
      SELECT 1 FROM vacancy_nodes vn
      WHERE vn.vacancy_id = ${vacancies.id}
        AND vn.node_id IN (${uuidList(preset.skillIds)})
    )`);
  }
  if (conds.length === 1) return conds[0];
  return sql`(${sql.join(conds, sql` AND `)})`;
}
