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
// Inverse of TIER_BUCKET: SQL tier_bucket ordinal → Fit badge (index = bucket).
const TIER_BY_BUCKET = ["STRETCH", "GOOD", "STRONG"] as const;

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

    // Per-vacancy relevance + tier_bucket (mirrors fitTierWeighted: IDF-weighted
    // required coverage; STRONG=2/GOOD=1/STRETCH=0). Shared by page + count query.
    const rankedCte = sql`
      cand(node_id) AS (VALUES ${cand}),
      -- candidate stack-set; empty => on_stack uniformly true (no-op). ADR-0010.
      css AS (
        SELECT DISTINCT m.stack FROM cand c
        JOIN node_tech_meta m ON m.node_id = c.node_id
        WHERE m.is_core AND m.stack IS NOT NULL
      ),
      -- vacancies worth scoring: overlap probe (vacancy_nodes.node_id index).
      ov AS (
        SELECT DISTINCT vn.vacancy_id AS id
        FROM vacancy_nodes vn
        JOIN cand c ON c.node_id = vn.node_id
      ),
      -- one pass per scored vacancy: relevance + weighted denominators + stack
      -- flags. node_stats is HIDDEN-free; both meta tables are 1-row-per-node.
      agg AS (
        SELECT vn.vacancy_id AS id,
               SUM(ns.weight) FILTER (WHERE c.node_id IS NOT NULL)::float8 AS relevance,
               COALESCE(SUM(ns.weight) FILTER (WHERE c.node_id IS NOT NULL AND vn.is_required), 0)::float8 AS matched_required_w,
               count(*) FILTER (WHERE vn.is_required) AS required_total,
               COALESCE(SUM(ns.weight) FILTER (WHERE vn.is_required), 0)::float8 AS required_total_w,
               COALESCE(SUM(ns.weight), 0)::float8 AS all_w,
               bool_or(tm.is_core AND vn.is_required AND tm.stack IS NOT NULL) AS has_concrete_core,
               bool_or(tm.is_core AND vn.is_required AND tm.stack IN (SELECT stack FROM css)) AS has_instack_core
        FROM ov
        JOIN vacancy_nodes vn ON vn.vacancy_id = ov.id
        JOIN node_stats ns ON ns.node_id = vn.node_id
        LEFT JOIN cand c ON c.node_id = vn.node_id
        LEFT JOIN node_tech_meta tm ON tm.node_id = vn.node_id
        GROUP BY vn.vacancy_id
      ),
      ranked AS (
        SELECT id, relevance,
               CASE
                 WHEN required_total = 0 THEN
                   CASE
                     WHEN all_w > 0 AND relevance / all_w >= ${FIT_STRONG_MIN} THEN 2
                     WHEN all_w > 0 AND relevance / all_w >= ${FIT_GOOD_MIN} THEN 1
                     ELSE 0
                   END
                 WHEN required_total_w > 0 AND matched_required_w / required_total_w >= ${FIT_STRONG_MIN} THEN 2
                 WHEN required_total_w > 0 AND matched_required_w / required_total_w >= ${FIT_GOOD_MIN} THEN 1
                 ELSE 0
               END AS tier_bucket,
               -- off-stack only when the vacancy positively belongs to another
               -- stack (concrete-stack required core, none in css); else on-stack.
               CASE
                 WHEN NOT EXISTS (SELECT 1 FROM css) THEN true
                 WHEN COALESCE(has_concrete_core, false)
                      AND NOT COALESCE(has_instack_core, false) THEN false
                 ELSE true
               END AS on_stack
        FROM agg
      )`;

    const minBucket = filters.minFitTier !== undefined ? TIER_BUCKET[filters.minFitTier] : 0;
    const tierCond = minBucket > 0 ? sql` AND rk.tier_bucket >= ${minBucket}` : sql``;

    const ranked = await this.db.execute<{
      id: string;
      relevance: number;
      on_stack: boolean;
      tier_bucket: number;
      total: number;
    }>(sql`
      WITH ${rankedCte},
      -- Collapse dedup groups: keep one representative per group — its
      -- best-ranked member — so duplicate postings never occupy adjacent
      -- slots on the ranked page. Ungrouped rows partition on their own id
      -- (rn = 1 trivially). Partition order mirrors the final ORDER BY.
      collapsed AS (
        SELECT v.id::text AS id, rk.relevance, rk.on_stack, rk.tier_bucket,
               row_number() OVER (
                 PARTITION BY coalesce(v.unique_vacancy_id, v.id)
                 ORDER BY rk.on_stack DESC, rk.tier_bucket DESC,
                          round(rk.relevance::numeric, 9) DESC, v.id
               ) AS rn
        FROM ranked rk
        JOIN vacancies v ON v.id = rk.id
        WHERE ${where}${tierCond}
      )
      SELECT id, relevance, on_stack, tier_bucket, (count(*) OVER ())::int AS total
      FROM collapsed
      WHERE rn = 1
      -- round so exact-IDF ties break by id (raw float-sum order is plan noise).
      ORDER BY on_stack DESC, tier_bucket DESC, round(relevance::numeric, 9) DESC, id
      LIMIT ${pageSize} OFFSET ${offset}
    `);

    // count(*) OVER () rides the page query — no second pass in the common case.
    // An empty page (all filtered out, or OFFSET past the end) returns no row
    // and thus no count, so fall back to a dedicated count there.
    let total = ranked.rows[0]?.total ?? 0;
    if (ranked.rows.length === 0) {
      const totalRes = await this.db.execute<{ count: number }>(sql`
        WITH ${rankedCte}
        SELECT count(DISTINCT coalesce(v.unique_vacancy_id, v.id))::int AS count
        FROM ranked rk
        JOIN vacancies v ON v.id = rk.id
        WHERE ${where}${tierCond}
      `);
      total = totalRes.rows[0]?.count ?? 0;
    }

    const items = await this.buildItems(ranked.rows, candIds, resolved.matched);
    return { resolved, items, page, pageSize, total };
  }

  // Per-page assembly: hydrate full feed DTOs + compute the ✅/❌/➕ diff over
  // the page's ~20 vacancies (tracker: diff is per-page, not corpus-wide).
  private async buildItems(
    rows: { id: string; relevance: number; on_stack: boolean; tier_bucket: number }[],
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
      // Counts feed the "X of Y required" label; the badge is the SQL tier_bucket.
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
      items.push({
        vacancy,
        relevance: row.relevance,
        onStack: row.on_stack,
        fit: {
          tier: TIER_BY_BUCKET[row.tier_bucket],
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
    if (f.employmentTypes?.length) inText(sql`v.employment_type`, f.employmentTypes);

    // Domain (OR): keep vacancies tagged with any listed DOMAIN node — a vacancy
    // filter, mirroring the feed (the candidate stays the query).
    if (f.domainIds?.length) inText(sql`v.domain_node_id`, f.domainIds);

    // Discrete experience buttons (OR): exact tokens + "6+" (≥6). Lenient on NULL
    // — unstated experience always passes; only explicit non-matches drop. Mirrors
    // feed.service buildWhere.
    if (f.experienceYears?.length) {
      const exact = f.experienceYears.filter((t) => /^\d+$/.test(t)).map(Number);
      const openEnded = f.experienceYears.includes("6+");
      const arms: SQL[] = [sql`v.experience_years IS NULL`];
      if (exact.length > 0) {
        arms.push(
          sql`v.experience_years IN (${sql.join(
            exact.map((n) => sql`${n}`),
            sql`, `,
          )})`,
        );
      }
      if (openEnded) arms.push(sql`v.experience_years >= 6`);
      // No real token → skip, don't collapse results to NULL-only rows.
      if (arms.length > 1) conds.push(sql`(${sql.join(arms, sql` OR `)})`);
    }

    // Test task: "without" (false) keeps unknowns — a null (unscored) vacancy
    // still counts as no-test, so only a confirmed true is excluded (mirrors
    // the feed). "with" (true) stays strict.
    if (f.hasTestAssignment === true) {
      conds.push(sql`v.has_test_assignment = true`);
    } else if (f.hasTestAssignment === false) {
      conds.push(sql`(v.has_test_assignment = false OR v.has_test_assignment IS NULL)`);
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
