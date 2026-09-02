import { Inject, Injectable } from "@nestjs/common";

import { sql, type SQL } from "drizzle-orm";

import { DRIZZLE } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { AnalyticsService } from "../../platform/analytics/analytics.service";
import { ELIGIBLE_POSITION } from "../../platform/shared/eligible";
import { uuidList } from "../../platform/shared/sql";
import { buildWhere, FeedService } from "../feed/feed.service";
import { buildScoreBreakdown, fitPercent, TIER_BY_BUCKET } from "../score/score.contract";
import { scoringCtes } from "../score/score.sql";
import { scorerForNodeIds } from "../score/scorer.port";

import {
  FIT_GOOD_MIN,
  ROLE_SUGGEST_WINDOW_DAYS,
  type MatchFilters,
  type MatchResponse,
  type RankedVacancy,
  type ResolveResult,
  type RoleSuggestionsResponse,
  type SkillRef,
} from "./ranking.contract";
import { deriveRoleSuggestions } from "./role-suggestions.derive";

// TIER_BUCKET / TIER_BY_BUCKET now live in score.contract.ts, shared with
// scorer.port.ts's overlayFor — one table each direction, not one per consumer.

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
    private readonly analytics: AnalyticsService,
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
      return { resolved, items: [], page, pageSize, total: 0, offStackHidden: 0 };
    }

    const candIds = uuidList(nodeIds);
    // The match path filters through the feed's own builder so the two cannot
    // drift. `includeRoleless: false` keeps the VERIFIED-role gate on.
    const where =
      buildWhere({
        page: 1,
        pageSize: 1,
        seniorities: filters.seniorities,
        workFormats: filters.workFormats,
        englishLevels: filters.englishLevels,
        employmentTypes: filters.employmentTypes,
        domainIds: filters.domainIds,
        roleIds: filters.roleNodeIds,
        excludedSkillIds: filters.excludedSkillNodeIds,
        experienceYears: filters.experienceYears,
        hasTestAssignment: filters.hasTestAssignment,
        hasReservation: filters.hasReservation,
        sourceId: filters.sourceId,
        postedWithinDays: filters.postedWithinDays,
        loadedAfter: filters.loadedAfter,
        excludeIds: filters.excludeIds,
        includeRoleless: false,
      }) ?? sql`true`;
    const offset = (page - 1) * pageSize;

    // Per-Position relevance + coverage + tier_bucket + on_stack, owned by the
    // score module — driven through fragments() (§7 step 4) instead of built
    // inline. `requireOverlap: true` is what keeps this endpoint the "shares
    // ≥1 skill" set the old `ov` probe used to gate; the unified feed path
    // (GET /feed) is the one place that leaves it off.
    const scorer = scorerForNodeIds(this.db, nodeIds);
    const frag = scorer.fragments({ minFitTier: filters.minFitTier, requireOverlap: true });

    // Off-stack is a FILTER, not a sort demote: while it sat in ORDER BY, a
    // 64%-fit in-stack card outranked an 87%-fit off-stack one and the page
    // order contradicted the number printed on it. Hidden by default; the count
    // of what's hidden rides the page query so the UI can offer to unhide.
    const includeOffStack = filters.includeOffStack === true;
    const keep = includeOffStack ? sql`true` : sql`on_stack`;

    // Sort swaps ORDER BY and nothing else — the scoring CTE still runs for a
    // date-sorted page, because the Fit number is on every card either way.
    const byDate = filters.sort === "date";
    // round so exact-IDF ties break by id (raw float-sum order is plan noise).
    const pageOrder = byDate ? sql`posted_at DESC, id DESC` : frag.order;

    const rankedPositionsCte = sql`
      ranked_positions AS (
        SELECT p.position_id::text AS id, ${frag.select},
               p.last_source_activity_at AS posted_at
        FROM ranked rk
        ${frag.join}
        WHERE ${where}${frag.filter ? sql` AND ${frag.filter}` : sql``}
      )`;

    const ranked = await this.db.execute<{
      id: string;
      relevance: number;
      coverage: number;
      on_stack: boolean;
      tier_bucket: number;
      total: number;
      off_stack_hidden: number;
    }>(sql`
      WITH ${frag.cte}, ${rankedPositionsCte},
      -- Both counts come off the same window pass, before the off-stack rows
      -- are filtered away (a window function can't see what WHERE removed).
      counted AS (
        SELECT id, relevance, coverage, on_stack, tier_bucket, posted_at,
               (count(*) FILTER (WHERE ${keep}) OVER ())::int AS total,
               (count(*) FILTER (WHERE NOT on_stack) OVER ())::int AS off_stack_hidden
        FROM ranked_positions
      )
      SELECT id, relevance, coverage, on_stack, tier_bucket, total, off_stack_hidden
      FROM counted
      WHERE ${keep}
      ORDER BY ${pageOrder}
      LIMIT ${pageSize} OFFSET ${offset}
    `);

    // The counts ride the page query — no second pass in the common case. An
    // empty page (all filtered out, or OFFSET past the end) returns no row and
    // thus no counts, so fall back to a dedicated count there.
    let total = ranked.rows[0]?.total ?? 0;
    let offStackHidden = ranked.rows[0]?.off_stack_hidden ?? 0;
    if (ranked.rows.length === 0) {
      const totalRes = await this.db.execute<{ count: number; off_stack_hidden: number }>(sql`
        WITH ${frag.cte}, ${rankedPositionsCte}
        SELECT (count(*) FILTER (WHERE ${keep}))::int AS count,
               (count(*) FILTER (WHERE NOT on_stack))::int AS off_stack_hidden
        FROM ranked_positions
      `);
      total = totalRes.rows[0]?.count ?? 0;
      offStackHidden = totalRes.rows[0]?.off_stack_hidden ?? 0;
    }

    // Calibration raw data (design §8): sampled to first pages — every fresh
    // match starts at page 1, so this sees each scoring context once.
    if (page === 1) void this.emitMatchScored(frag.cte, where, nodeIds.length);

    const items = await this.buildItems(ranked.rows, candIds, resolved.matched);
    return {
      resolved,
      items,
      page,
      pageSize,
      total,
      offStackHidden: includeOffStack ? 0 : offStackHidden,
    };
  }

  // match_scored: coverage histogram (10 buckets over [0,1]) + tier counts for
  // the filtered result set, deliberately pre-off-stack — this
  // measures how the scorer behaves, not what the page chose to show.
  // Fire-and-forget — a telemetry failure must never affect the match response.
  private async emitMatchScored(scoreCte: SQL, where: SQL, skillsCount: number): Promise<void> {
    try {
      const res = await this.db.execute<{ bucket: number; n: number }>(sql`
        WITH ${scoreCte}
        SELECT least(floor(rk.coverage * 10), 9)::int AS bucket, count(*)::int AS n
        FROM ranked rk
        JOIN positions p ON p.position_id = rk.id
        WHERE ${where} AND rk.relevance IS NOT NULL
        GROUP BY 1
      `);
      const hist = Array.from({ length: 10 }, () => 0);
      for (const r of res.rows) hist[r.bucket] = r.n;
      const sum = (from: number, to: number) => hist.slice(from, to).reduce((a, b) => a + b, 0);
      this.analytics.matchScored({
        skills_count: skillsCount,
        total: sum(0, 10),
        strong_count: sum(8, 10),
        good_count: sum(5, 8),
        stretch_count: sum(0, 5),
        coverage_hist: hist,
      });
    } catch {
      // swallow: calibration telemetry only
    }
  }

  // Score each ROLE node by how well the candidate's skill set covers its
  // last-30d Positions: total per role, GOOD+ count, and mean coverage (the
  // cold-start signal). Selection/smoothing lives in deriveRoleSuggestions.
  async suggestRoles(
    candidate: SkillRef[],
    pinnedRoleId: string | null,
  ): Promise<RoleSuggestionsResponse> {
    const nodeIds = candidate.map((m) => m.id);
    if (nodeIds.length === 0) return { reduced: true, items: [] };
    const cand = sql.join(
      nodeIds.map((id) => sql`(${id}::uuid)`),
      sql`, `,
    );

    // LEFT JOIN: a role vacancy with zero candidate overlap counts in the
    // denominator with coverage 0 — totals span the whole role, not the probe.
    const result = await this.db.execute<{
      role_id: string;
      slug: string | null;
      name: string;
      total: number;
      good: number;
      avg_coverage: number;
    }>(sql`
      WITH ${scoringCtes(cand)},
      per_position AS (
        SELECT p.role_node_id AS role_id, COALESCE(s.coverage, 0) AS coverage
        FROM positions p
        LEFT JOIN scored s ON s.id = p.position_id
        WHERE ${ELIGIBLE_POSITION}
          AND p.last_source_activity_at >
              now() - make_interval(days => ${ROLE_SUGGEST_WINDOW_DAYS})
      )
      SELECT r.id::text AS role_id, r.slug AS slug, r.canonical_name AS name,
             count(*)::int AS total,
             (count(*) FILTER (WHERE pv.coverage >= ${FIT_GOOD_MIN}))::int AS good,
             avg(pv.coverage)::float8 AS avg_coverage
      FROM per_position pv
      JOIN nodes r ON r.id = pv.role_id
      GROUP BY r.id, r.slug, r.canonical_name
    `);

    return deriveRoleSuggestions(
      result.rows.map((r) => ({
        roleId: r.role_id,
        slug: r.slug,
        name: r.name,
        goodCount: r.good,
        totalCount: r.total,
        avgCoverage: r.avg_coverage,
      })),
      pinnedRoleId,
    );
  }

  // Per-page assembly: hydrate full feed DTOs + compute the ✅/❌/➕ diff over
  // the page's ~20 vacancies (tracker: diff is per-page, not corpus-wide).
  private async buildItems(
    rows: {
      id: string;
      relevance: number;
      coverage: number;
      on_stack: boolean;
      tier_bucket: number;
    }[],
    candIds: SQL,
    candidate: SkillRef[],
  ): Promise<RankedVacancy[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const dtos = await this.feed.hydratePositionsByIds(ids);

    const pageIds = uuidList(ids);
    const skillRows = await this.db.execute<{
      position_id: string;
      node_id: string;
      name: string;
      is_required: boolean;
      weight: number | null;
      in_candidate: boolean;
    }>(sql`
      SELECT pn.position_id::text AS position_id, pn.node_id::text AS node_id,
             n.canonical_name AS name, pn.is_required,
             ns.weight AS weight,
             (pn.node_id IN (${candIds})) AS in_candidate
      FROM position_nodes pn
      JOIN nodes n ON n.id = pn.node_id AND n.status <> 'HIDDEN'
      LEFT JOIN node_stats ns ON ns.node_id = pn.node_id
      WHERE pn.position_id IN (${pageIds})
    `);

    const byPosition = new Map<string, typeof skillRows.rows>();
    for (const r of skillRows.rows) {
      const arr = byPosition.get(r.position_id) ?? [];
      arr.push(r);
      byPosition.set(r.position_id, arr);
    }
    const items: RankedVacancy[] = [];
    for (const row of rows) {
      const vacancy = dtos.get(row.id);
      if (!vacancy) continue;
      const vskills = byPosition.get(row.id) ?? [];
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
      const breakdown = buildScoreBreakdown(row.coverage);
      items.push({
        vacancy,
        relevance: row.relevance,
        onStack: row.on_stack,
        fit: {
          tier: TIER_BY_BUCKET[row.tier_bucket],
          percent: fitPercent(breakdown.total),
          matchedRequired,
          requiredTotal,
        },
        breakdown,
        diff: {
          have: have.sort(byWeight),
          missing: missing.sort(byWeight),
          bonus: [...bonus].sort(byWeight),
        },
      });
    }
    return items;
  }
}
