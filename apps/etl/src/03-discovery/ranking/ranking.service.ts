import { Inject, Injectable } from "@nestjs/common";
import { sql, type SQL } from "drizzle-orm";

import { DRIZZLE } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { ELIGIBLE_VACANCY } from "../../platform/shared/eligible";
import {
  fitTier,
  type MatchFilters,
  type MatchResponse,
  type RankedVacancy,
  type ResolveResult,
  type SkillRef,
} from "./ranking.contract";

// reverse-ATS matcher (md/journal/migrations/reverse-ats.md §2). Two responsibilities:
//   1. resolveSkills — plain-text CV skills → SKILL node ids (exact canonical or
//      alias match, NEW + VERIFIED, HIDDEN excluded to mirror node_stats).
//   2. match — OR-overlap ranking: SUM(node_stats.weight) = relevance, required
//      coverage = fit tier, plus the per-page ✅/❌/➕ skill diff.
@Injectable()
export class RankingService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async resolveSkills(skills: string[]): Promise<ResolveResult> {
    const cleaned = [...new Set(skills.map((s) => s.trim()).filter(Boolean))];
    if (cleaned.length === 0) return { matched: [], unmatched: [] };
    const lowered = cleaned.map((s) => s.toLowerCase());
    const inList = sql.join(
      lowered.map((s) => sql`${s}`),
      sql`, `,
    );

    // Canonical and alias hits in one shot; node_stats weight is LEFT-joined
    // (a skill on zero vacancies has no node_stats row → weight 0).
    const result = await this.db.execute<{
      key: string;
      id: string;
      name: string;
      weight: number | null;
      via: "canonical" | "alias";
    }>(sql`
      SELECT lower(n.canonical_name) AS key, n.id::text AS id,
             n.canonical_name AS name, ns.weight AS weight, 'canonical' AS via
      FROM nodes n
      LEFT JOIN node_stats ns ON ns.node_id = n.id
      WHERE n.type = 'SKILL' AND n.status <> 'HIDDEN'
        AND lower(n.canonical_name) IN (${inList})
      UNION ALL
      SELECT lower(a.name) AS key, n.id::text AS id,
             n.canonical_name AS name, ns.weight AS weight, 'alias' AS via
      FROM node_aliases a
      JOIN nodes n ON n.id = a.node_id
      LEFT JOIN node_stats ns ON ns.node_id = n.id
      WHERE a.type = 'SKILL' AND n.status <> 'HIDDEN'
        AND lower(a.name) IN (${inList})
    `);

    // Prefer a canonical hit over an alias hit for the same input.
    const byKey = new Map<string, SkillRef>();
    for (const r of result.rows) {
      if (r.via === "canonical") {
        byKey.set(r.key, { id: r.id, name: r.name, weight: r.weight ?? 0 });
      }
    }
    for (const r of result.rows) {
      if (r.via === "alias" && !byKey.has(r.key)) {
        byKey.set(r.key, { id: r.id, name: r.name, weight: r.weight ?? 0 });
      }
    }

    const matched: SkillRef[] = [];
    const seen = new Set<string>();
    const unmatched: string[] = [];
    cleaned.forEach((raw, i) => {
      const hit = byKey.get(lowered[i]);
      if (!hit) return unmatched.push(raw);
      if (!seen.has(hit.id)) {
        seen.add(hit.id);
        matched.push(hit);
      }
    });
    return { matched, unmatched };
  }

  async match(
    skills: string[],
    filters: MatchFilters,
    page: number,
    pageSize: number,
  ): Promise<MatchResponse> {
    const resolved = await this.resolveSkills(skills);
    const nodeIds = resolved.matched.map((m) => m.id);
    if (nodeIds.length === 0) {
      return { resolved, items: [], page, pageSize, total: 0 };
    }

    const cand = sql.join(
      nodeIds.map((id) => sql`(${id}::uuid)`),
      sql`, `,
    );
    const candIds = sql.join(
      nodeIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    );
    const where = this.buildFilters(filters);
    const offset = (page - 1) * pageSize;

    const ranked = await this.db.execute<{
      id: string;
      title: string;
      company: string | null;
      seniority: string | null;
      relevance: number;
    }>(sql`
      WITH cand(node_id) AS (VALUES ${cand}),
      scored AS (
        SELECT vn.vacancy_id AS id, SUM(ns.weight)::float8 AS relevance
        FROM vacancy_nodes vn
        JOIN cand c ON c.node_id = vn.node_id
        JOIN node_stats ns ON ns.node_id = vn.node_id
        GROUP BY vn.vacancy_id
      )
      SELECT v.id::text AS id, v.title, comp.name AS company,
             v.seniority::text AS seniority, s.relevance
      FROM scored s
      JOIN vacancies v ON v.id = s.id
      LEFT JOIN companies comp ON comp.id = v.company_id
      WHERE ${where}
      ORDER BY s.relevance DESC, v.id
      LIMIT ${pageSize} OFFSET ${offset}
    `);

    const totalRes = await this.db.execute<{ count: number }>(sql`
      WITH cand(node_id) AS (VALUES ${cand}),
      scored AS (
        SELECT DISTINCT vn.vacancy_id AS id
        FROM vacancy_nodes vn
        JOIN cand c ON c.node_id = vn.node_id
      )
      SELECT count(*)::int AS count
      FROM scored s JOIN vacancies v ON v.id = s.id
      WHERE ${where}
    `);
    const total = totalRes.rows[0]?.count ?? 0;

    const items = await this.buildItems(ranked.rows, candIds, resolved.matched);
    return { resolved, items, page, pageSize, total };
  }

  // Per-page diff (tracker: computed for the page's ~20 rows, not the corpus).
  private async buildItems(
    rows: {
      id: string;
      title: string;
      company: string | null;
      seniority: string | null;
      relevance: number;
    }[],
    candIds: SQL,
    candidate: SkillRef[],
  ): Promise<RankedVacancy[]> {
    if (rows.length === 0) return [];
    const pageIds = sql.join(
      rows.map((r) => sql`${r.id}::uuid`),
      sql`, `,
    );
    const skillRows = await this.db.execute<{
      vacancy_id: string;
      node_id: string;
      name: string;
      is_required: boolean;
      weight: number | null;
      in_candidate: boolean;
    }>(sql`
      SELECT vn.vacancy_id::text AS vacancy_id, vn.node_id::text AS node_id,
             n.canonical_name AS name, vn.is_required,
             ns.weight AS weight,
             (vn.node_id IN (${candIds})) AS in_candidate
      FROM vacancy_nodes vn
      JOIN nodes n ON n.id = vn.node_id AND n.status <> 'HIDDEN'
      LEFT JOIN node_stats ns ON ns.node_id = vn.node_id
      WHERE vn.vacancy_id IN (${pageIds})
    `);

    const byVacancy = new Map<string, typeof skillRows.rows>();
    for (const r of skillRows.rows) {
      const arr = byVacancy.get(r.vacancy_id) ?? [];
      arr.push(r);
      byVacancy.set(r.vacancy_id, arr);
    }
    const byWeight = (a: SkillRef, b: SkillRef) => b.weight - a.weight;

    return rows.map((row) => {
      const vskills = byVacancy.get(row.id) ?? [];
      const vacancyNodeIds = new Set(vskills.map((s) => s.node_id));
      const have: SkillRef[] = [];
      const missing: SkillRef[] = [];
      let requiredTotal = 0;
      let matchedRequired = 0;
      for (const s of vskills) {
        const ref: SkillRef = { id: s.node_id, name: s.name, weight: s.weight ?? 0 };
        if (s.is_required) requiredTotal += 1;
        if (s.in_candidate) {
          have.push(ref);
          if (s.is_required) matchedRequired += 1;
        } else if (s.is_required) {
          missing.push(ref);
        }
      }
      const bonus = candidate.filter((c) => !vacancyNodeIds.has(c.id));
      return {
        id: row.id,
        title: row.title,
        company: row.company,
        seniority: row.seniority as RankedVacancy["seniority"],
        relevance: row.relevance,
        fit: { tier: fitTier(matchedRequired, requiredTotal), matchedRequired, requiredTotal },
        diff: {
          have: have.sort(byWeight),
          missing: missing.sort(byWeight),
          bonus: [...bonus].sort(byWeight),
        },
      };
    });
  }

  // ELIGIBLE_VACANCY mirrors the feed (only VERIFIED-role vacancies are
  // browsable) so the matcher ranks what the user can actually open.
  private buildFilters(f: MatchFilters): SQL {
    const conds: SQL[] = [ELIGIBLE_VACANCY];
    if (f.seniority) conds.push(sql`v.seniority::text = ${f.seniority}`);
    if (f.workFormat) conds.push(sql`v.work_format::text = ${f.workFormat}`);
    if (f.sourceId) conds.push(sql`v.source_id = ${f.sourceId}::uuid`);
    return sql.join(conds, sql` AND `);
  }
}
