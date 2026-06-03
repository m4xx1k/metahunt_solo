import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";

import { DRIZZLE } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import type { NodeRef } from "../shared/contract";
import type { ContextualSkill, TrackDto } from "./tracks.contract";
import {
  presetCondition,
  uuidList,
  type TrackNodeIds,
  type TrackPreset,
} from "./track-preset";

// Thin DB gateway for the browse-tree (tracks) read side: the SQL lives here,
// the preset resolution and predicate logic stay pure in track-preset.ts. Keeps
// VacanciesService free of raw track SQL and makes the rules unit-testable.
@Injectable()
export class TracksRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  // Every active track with its inherited vacancy count, flat (the web nests by
  // parentSlug). JIT is disabled for this statement: track_counts' correlated
  // count subquery hands the planner a wildly inflated cost that trips Postgres
  // JIT (~265ms compile, 3x the query). SET LOCAL releases at txn end, so the
  // pooled connection is unaffected. ~340ms → ~70ms.
  async findTrackTree(): Promise<TrackDto[]> {
    const rows = await this.db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL jit = off`);
      return tx.execute<{
        slug: string;
        label: string;
        parent_slug: string | null;
        count: number;
        sort_order: number;
      }>(sql`
        SELECT t.slug AS slug,
               t.label AS label,
               pt.slug AS parent_slug,
               COALESCE(tc.vacancy_count, 0)::int AS count,
               t.sort_order AS sort_order
        FROM tracks t
        LEFT JOIN tracks pt ON pt.id = t.parent_id
        LEFT JOIN track_counts tc ON tc.track_id = t.id
        WHERE t.is_active
        ORDER BY t.sort_order, t.slug
      `);
    });
    return rows.rows.map((r) => ({
      slug: r.slug,
      label: r.label,
      parentSlug: r.parent_slug,
      count: r.count,
      sortOrder: r.sort_order,
    }));
  }

  // A track's own node ids and its parent's (one hop), split by axis — the raw
  // input to resolveTrackPreset. Null for an unknown/inactive slug.
  async findTrackNodeIds(slug: string): Promise<TrackNodeIds | null> {
    const rows = await this.db.execute<{
      track_id: string | null;
      own_role_ids: string[] | null;
      own_skill_ids: string[] | null;
      parent_role_ids: string[] | null;
      parent_skill_ids: string[] | null;
    }>(sql`
      WITH t AS (
        SELECT id, parent_id FROM tracks WHERE slug = ${slug} AND is_active
      ),
      own AS (
        SELECT n.type AS ntype, array_agg(tn.node_id::text) AS ids
        FROM track_nodes tn
        JOIN nodes n ON n.id = tn.node_id
        WHERE tn.track_id = (SELECT id FROM t)
        GROUP BY n.type
      ),
      par AS (
        SELECT n.type AS ntype, array_agg(tn.node_id::text) AS ids
        FROM track_nodes tn
        JOIN nodes n ON n.id = tn.node_id
        WHERE tn.track_id = (SELECT parent_id FROM t)
        GROUP BY n.type
      )
      SELECT
        (SELECT id::text FROM t)                     AS track_id,
        (SELECT ids FROM own WHERE ntype = 'ROLE')   AS own_role_ids,
        (SELECT ids FROM own WHERE ntype = 'SKILL')  AS own_skill_ids,
        (SELECT ids FROM par WHERE ntype = 'ROLE')   AS parent_role_ids,
        (SELECT ids FROM par WHERE ntype = 'SKILL')  AS parent_skill_ids
    `);
    const row = rows.rows[0];
    if (!row || row.track_id === null) return null;
    return {
      own: {
        roleIds: row.own_role_ids ?? [],
        skillIds: row.own_skill_ids ?? [],
      },
      parent: {
        roleIds: row.parent_role_ids ?? [],
        skillIds: row.parent_skill_ids ?? [],
      },
    };
  }

  // The id + canonical name of each node in a preset, split by axis and ordered
  // by name — the named preset the filter sidebar shows on by default.
  async findPresetNodes(
    preset: TrackPreset,
  ): Promise<{ roles: NodeRef[]; skills: NodeRef[] }> {
    const ids = [...preset.roleIds, ...preset.skillIds];
    if (ids.length === 0) return { roles: [], skills: [] };

    const rows = await this.db.execute<{
      id: string;
      name: string;
      type: string;
    }>(sql`
      SELECT n.id::text AS id, n.canonical_name AS name, n.type::text AS type
      FROM nodes n
      WHERE n.id IN (${uuidList(ids)})
      ORDER BY n.canonical_name
    `);
    const pick = (t: string): NodeRef[] =>
      rows.rows
        .filter((r) => r.type === t)
        .map((r) => ({ id: r.id, name: r.name }));
    return { roles: pick("ROLE"), skills: pick("SKILL") };
  }

  // Skills most common among the vacancies a preset matches, excluding the
  // preset's own skills (already applied) — the contextual facet suggestions.
  // Top 12 by distinct-vacancy count. Caller guards the empty-preset case.
  async findContextualSkills(preset: TrackPreset): Promise<ContextualSkill[]> {
    const excludeOwn =
      preset.skillIds.length > 0
        ? sql`AND n.id NOT IN (${uuidList(preset.skillIds)})`
        : sql``;

    const rows = await this.db.execute<{
      id: string;
      name: string;
      count: number;
    }>(sql`
      SELECT n.id::text AS id,
             n.canonical_name AS name,
             COUNT(DISTINCT vn.vacancy_id)::int AS count
      FROM vacancy_nodes vn
      JOIN nodes n ON n.id = vn.node_id AND n.type = 'SKILL' AND n.status = 'VERIFIED'
      WHERE vn.vacancy_id IN (
        SELECT vacancies.id FROM vacancies
        JOIN nodes rn ON rn.id = vacancies.role_node_id AND rn.status = 'VERIFIED'
        WHERE ${presetCondition(preset)}
      )
      ${excludeOwn}
      GROUP BY n.id, n.canonical_name
      ORDER BY COUNT(DISTINCT vn.vacancy_id) DESC
      LIMIT 12
    `);
    return rows.rows.map((r) => ({ id: r.id, name: r.name, count: r.count }));
  }
}
