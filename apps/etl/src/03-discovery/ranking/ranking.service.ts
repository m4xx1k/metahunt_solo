import { Inject, Injectable } from "@nestjs/common";
import { sql, type SQL } from "drizzle-orm";

import { DRIZZLE } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { ELIGIBLE_VACANCY } from "../../platform/shared/eligible";
import { uuidList } from "../../platform/shared/sql";
import { FeedService } from "../feed/feed.service";
import {
  FIT_GOOD_MIN,
  FIT_STRONG_MIN,
  fitTierWeighted,
  type FitTier,
  type MatchFilters,
  type MatchResponse,
  type RankedVacancy,
  type ResolveResult,
  type SkillRef,
} from "./ranking.contract";

// Ordinal of each Fit tier, mirroring the SQL tier_bucket CASE. The minFitTier
// filter keeps rows with tier_bucket >= the requested tier's ordinal.
const TIER_BUCKET: Record<FitTier, number> = { STRETCH: 0, GOOD: 1, STRONG: 2 };

const byWeight = (a: SkillRef, b: SkillRef) => b.weight - a.weight;

// reverse-ATS matcher (md/journal/migrations/reverse-ats.md §2).
//   resolveSkills — plain-text skills → SKILL node ids (canonical+alias, NEW +
//     VERIFIED, HIDDEN excluded to mirror node_stats).
//   match / rankByRefs — OR-overlap ranking: SUM(node_stats.weight) = relevance,
//     required coverage = fit tier, per-page ✅/❌/➕ diff, hydrated into the
//     full feed VacancyDto so a ranked card is identical to a feed card.
@Injectable()
export class RankingService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly feed: FeedService,
  ) {}

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

  // Resolve a candidate's role string to a single ROLE node id (canonical+alias,
  // VERIFIED preferred — the recommendation cohort only holds VERIFIED-role
  // vacancies). null when nothing matches → reduced state upstream.
  async resolveRole(role: string | null): Promise<string | null> {
    const key = role?.trim().toLowerCase();
    if (!key) return null;
    const result = await this.db.execute<{
      id: string;
      via: "canonical" | "alias";
      status: string;
    }>(sql`
      SELECT n.id::text AS id, 'canonical' AS via, n.status AS status
      FROM nodes n
      WHERE n.type = 'ROLE' AND n.status <> 'HIDDEN'
        AND lower(n.canonical_name) = ${key}
      UNION ALL
      SELECT n.id::text AS id, 'alias' AS via, n.status AS status
      FROM node_aliases a
      JOIN nodes n ON n.id = a.node_id
      WHERE a.type = 'ROLE' AND n.status <> 'HIDDEN' AND lower(a.name) = ${key}
    `);
    const rows = result.rows;
    const pick =
      rows.find((r) => r.via === "canonical" && r.status === "VERIFIED") ??
      rows.find((r) => r.status === "VERIFIED") ??
      rows.find((r) => r.via === "canonical") ??
      rows[0];
    return pick?.id ?? null;
  }

  // Rank for plain-text skills (the demo / mock-candidate path).
  async match(
    skills: string[],
    filters: MatchFilters,
    page: number,
    pageSize: number,
  ): Promise<MatchResponse> {
    const resolved = await this.resolveSkills(skills);
    return this.rankByRefs(resolved, filters, page, pageSize);
  }

  // Rank for already-resolved skills (the stored-candidate path: GET
  // /cv/:id/matches passes candidate_nodes refs + the unmatched strings).
  async rankByRefs(
    resolved: ResolveResult,
    filters: MatchFilters,
    page: number,
    pageSize: number,
  ): Promise<MatchResponse> {
    const nodeIds = resolved.matched.map((m) => m.id);
    if (nodeIds.length === 0) {
      return { resolved, items: [], page, pageSize, total: 0 };
    }

    // `cand` is a VALUES row list `(uuid), (uuid)`; `candIds` is a flat
    // `uuid, uuid` for an IN (...) membership test.
    const cand = sql.join(
      nodeIds.map((id) => sql`(${id}::uuid)`),
      sql`, `,
    );
    const candIds = uuidList(nodeIds);
    const where = this.buildFilters(filters);
    const offset = (page - 1) * pageSize;

    // Shared CTE: per-vacancy relevance + tier_bucket. Both the page query and
    // the count query build on `ranked`, so the Fit-tier filter (which reads
    // the computed bucket, not a vacancy column) applies identically to both.
    // tier_bucket mirrors fitTierWeighted: STRONG=2, GOOD=1, STRETCH=0 — the
    // primary sort key. Coverage is IDF-WEIGHTED (Σ IDF(matched req) / Σ IDF(all
    // req)), so matching trivial low-IDF required skills can't inflate the tier
    // and a tiny required set no longer auto-hits 100%; relevance (Σ IDF) only
    // orders within a tier. No required skills tagged → weighted coverage over
    // ALL listed skills (relevance / all_w), never a free GOOD.
    const rankedCte = sql`
      cand(node_id) AS (VALUES ${cand}),
      -- candidate stack-set (the stacks they hold a core skill in) and, per
      -- scored vacancy, whether its REQUIRED core tech is in-stack. Drives the
      -- soft role-fit demote — see ADR-0010 / reverse-ats v2. Empty stack-set
      -- (no classified core skills) => on_stack is uniformly true => no reorder.
      css AS (
        SELECT DISTINCT m.stack FROM cand c
        JOIN node_tech_meta m ON m.node_id = c.node_id
        WHERE m.is_core AND m.stack IS NOT NULL
      ),
      scored AS (
        SELECT vn.vacancy_id AS id, SUM(ns.weight)::float8 AS relevance,
               count(*) FILTER (WHERE vn.is_required) AS matched_required,
               COALESCE(SUM(ns.weight) FILTER (WHERE vn.is_required), 0)::float8 AS matched_required_w
        FROM vacancy_nodes vn
        JOIN cand c ON c.node_id = vn.node_id
        JOIN node_stats ns ON ns.node_id = vn.node_id
        GROUP BY vn.vacancy_id
      ),
      req AS (
        SELECT vn.vacancy_id AS id,
               count(*) FILTER (WHERE vn.is_required) AS required_total,
               COALESCE(SUM(ns.weight) FILTER (WHERE vn.is_required), 0)::float8 AS required_total_w,
               COALESCE(SUM(ns.weight), 0)::float8 AS all_w
        FROM vacancy_nodes vn
        JOIN nodes n ON n.id = vn.node_id AND n.status <> 'HIDDEN'
        JOIN node_stats ns ON ns.node_id = vn.node_id
        WHERE vn.vacancy_id IN (SELECT id FROM scored)
        GROUP BY vn.vacancy_id
      ),
      vstack AS (
        SELECT vn.vacancy_id AS id,
               bool_or(m.is_core AND m.stack IS NOT NULL) AS has_concrete_core,
               bool_or(m.is_core AND m.stack IN (SELECT stack FROM css)) AS has_instack_core
        FROM vacancy_nodes vn
        JOIN node_tech_meta m ON m.node_id = vn.node_id AND vn.is_required
        WHERE vn.vacancy_id IN (SELECT id FROM scored)
        GROUP BY vn.vacancy_id
      ),
      ranked AS (
        SELECT s.id, s.relevance,
               CASE
                 WHEN COALESCE(r.required_total, 0) = 0 THEN
                   CASE
                     WHEN r.all_w > 0 AND s.relevance / r.all_w >= ${FIT_STRONG_MIN} THEN 2
                     WHEN r.all_w > 0 AND s.relevance / r.all_w >= ${FIT_GOOD_MIN} THEN 1
                     ELSE 0
                   END
                 WHEN r.required_total_w > 0 AND s.matched_required_w / r.required_total_w >= ${FIT_STRONG_MIN} THEN 2
                 WHEN r.required_total_w > 0 AND s.matched_required_w / r.required_total_w >= ${FIT_GOOD_MIN} THEN 1
                 ELSE 0
               END AS tier_bucket,
               -- on-stack unless the vacancy positively belongs to another stack
               -- (requires concrete-stack core tech, none of it in the candidate's
               -- stack-set). Stack-neutral / unclassified vacancies stay on-stack.
               -- Gated on a non-empty stack-set so it's a no-op without metadata.
               CASE
                 WHEN NOT EXISTS (SELECT 1 FROM css) THEN true
                 WHEN COALESCE(vs.has_concrete_core, false)
                      AND NOT COALESCE(vs.has_instack_core, false) THEN false
                 ELSE true
               END AS on_stack
        FROM scored s
        LEFT JOIN req r ON r.id = s.id
        LEFT JOIN vstack vs ON vs.id = s.id
      )`;

    const minBucket =
      filters.minFitTier !== undefined ? TIER_BUCKET[filters.minFitTier] : 0;
    const tierCond =
      minBucket > 0 ? sql` AND rk.tier_bucket >= ${minBucket}` : sql``;

    const ranked = await this.db.execute<{ id: string; relevance: number }>(sql`
      WITH ${rankedCte}
      SELECT v.id::text AS id, rk.relevance
      FROM ranked rk
      JOIN vacancies v ON v.id = rk.id
      WHERE ${where}${tierCond}
      ORDER BY rk.on_stack DESC, rk.tier_bucket DESC, rk.relevance DESC, v.id
      LIMIT ${pageSize} OFFSET ${offset}
    `);

    const totalRes = await this.db.execute<{ count: number }>(sql`
      WITH ${rankedCte}
      SELECT count(*)::int AS count
      FROM ranked rk
      JOIN vacancies v ON v.id = rk.id
      WHERE ${where}${tierCond}
    `);
    const total = totalRes.rows[0]?.count ?? 0;

    const items = await this.buildItems(
      ranked.rows,
      candIds,
      resolved.matched,
    );
    return { resolved, items, page, pageSize, total };
  }

  // Per-page assembly: hydrate full feed DTOs + compute the ✅/❌/➕ diff over
  // the page's ~20 vacancies (tracker: diff is per-page, not corpus-wide).
  private async buildItems(
    rows: { id: string; relevance: number }[],
    candIds: SQL,
    candidate: SkillRef[],
  ): Promise<RankedVacancy[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const dtos = await this.feed.hydrateByIds(ids);

    const pageIds = uuidList(ids);
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
    const items: RankedVacancy[] = [];
    for (const row of rows) {
      const vacancy = dtos.get(row.id);
      if (!vacancy) continue; // hydrate can't lose a row, but stay defensive
      const vskills = byVacancy.get(row.id) ?? [];
      const vacancyNodeIds = new Set(vskills.map((s) => s.node_id));
      const have: SkillRef[] = [];
      const missing: SkillRef[] = [];
      // Counts stay for honest display ("X of Y required"); the *_w weighted
      // sums drive the badge so it matches the IDF-weighted SQL tier.
      let requiredTotal = 0;
      let matchedRequired = 0;
      let requiredW = 0;
      let matchedRequiredW = 0;
      let allW = 0;
      let matchedAllW = 0;
      for (const s of vskills) {
        const w = s.weight ?? 0;
        const ref: SkillRef = { id: s.node_id, name: s.name, weight: w };
        allW += w;
        if (s.is_required) {
          requiredTotal += 1;
          requiredW += w;
        }
        if (s.in_candidate) {
          have.push(ref);
          matchedAllW += w;
          if (s.is_required) {
            matchedRequired += 1;
            matchedRequiredW += w;
          }
        } else if (s.is_required) {
          missing.push(ref);
        }
      }
      const bonus = candidate.filter((c) => !vacancyNodeIds.has(c.id));
      items.push({
        vacancy,
        relevance: row.relevance,
        fit: {
          tier: fitTierWeighted(matchedRequiredW, requiredW, matchedAllW, allW),
          matchedRequired,
          requiredTotal,
        },
        diff: {
          have: have.sort(byWeight),
          missing: missing.sort(byWeight),
          bonus: [...bonus].sort(byWeight),
        },
      });
    }
    return items;
  }

  // ELIGIBLE_VACANCY mirrors the feed (only VERIFIED-role vacancies are
  // browsable) so the matcher ranks what the user can actually open. All the
  // enum filters are OR-within / AND-across (any listed seniority AND any
  // listed english …). The Fit-tier filter is NOT here — it reads the computed
  // tier_bucket, so it's applied against the `ranked` CTE in rankByRefs.
  private buildFilters(f: MatchFilters): SQL {
    const conds: SQL[] = [ELIGIBLE_VACANCY];
    const inText = (col: SQL, vals: readonly string[]) =>
      conds.push(
        sql`${col}::text IN (${sql.join(
          vals.map((v) => sql`${v}`),
          sql`, `,
        )})`,
      );

    if (f.seniorities?.length) inText(sql`v.seniority`, f.seniorities);
    if (f.workFormats?.length) inText(sql`v.work_format`, f.workFormats);
    if (f.englishLevels?.length) inText(sql`v.english_level`, f.englishLevels);
    if (f.employmentTypes?.length)
      inText(sql`v.employment_type`, f.employmentTypes);

    // Test task: "without" (false) keeps unknowns — a null (unscored) vacancy
    // still counts as no-test, so only a confirmed true is excluded (mirrors
    // the feed). "with" (true) stays strict.
    if (f.hasTestAssignment === true) {
      conds.push(sql`v.has_test_assignment = true`);
    } else if (f.hasTestAssignment === false) {
      conds.push(
        sql`(v.has_test_assignment = false OR v.has_test_assignment IS NULL)`,
      );
    }
    if (f.hasReservation !== undefined) {
      conds.push(sql`v.has_reservation = ${f.hasReservation}`);
    }

    if (f.sourceId) conds.push(sql`v.source_id = ${f.sourceId}::uuid`);
    if (f.postedWithinDays !== undefined) {
      // Freshness: published_at when known, else loaded_at (mirrors the feed's
      // coalesce sort). make_interval keeps the day count a bound parameter.
      conds.push(
        sql`coalesce(v.published_at, v.loaded_at) > now() - make_interval(days => ${f.postedWithinDays})`,
      );
    }

    // Digest-only window (page UI never sets these).
    if (f.loadedAfter) conds.push(sql`v.loaded_at > ${f.loadedAfter}`);
    if (f.excludeIds?.length) {
      conds.push(sql`v.id NOT IN (${uuidList(f.excludeIds)})`);
    }
    return sql.join(conds, sql` AND `);
  }
}
