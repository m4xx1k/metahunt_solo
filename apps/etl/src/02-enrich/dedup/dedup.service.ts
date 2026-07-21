import { Inject, Injectable, Logger } from "@nestjs/common";

import { and, eq, sql, type SQL } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import type {
  DedupMetrics,
  DedupReason,
  FeedDuplicateGroup,
  SourceBadge,
  UniqueVacanciesQuery,
  UniqueVacanciesResponse,
  UniqueVacancyListItem,
  UniqueVacancyMember,
} from "./dedup.contract";
import { buildEmbeddingText, type EmbeddingTextInput } from "./embedding-text.builder";
import { EMBEDDING_DIMENSIONS, OpenAIEmbeddingsClient } from "./openai-embeddings.client";

// ──────────────────────── Tunables ────────────────────────
// Surfaced as constants instead of env vars for now — values come from
// the brief, will move to config once we calibrate on a labelled set.
const HARD_THRESHOLD = 0.92;
// Above HARD a merge happens; above GOLD *and* corroborated by a
// structural signal it is promoted to the `gold` tier — the clean
// cross-source list shown on the dashboard demo view.
const GOLD_THRESHOLD = 0.95;
const SKILL_JACCARD_GOLD = 0.5;
const TITLE_JACCARD_GOLD = 0.5;
// 45d (was 14d): republish bumps drift true duplicates up to ~44 days apart;
// the ±14d prefilter was the audit's biggest recall gap. Gates hold precision.
const PREFILTER_DATE_WINDOW_DAYS = 45;
const PREFILTER_TOP_N = 20;
const EMBED_BATCH_SIZE = 100;

interface VacancyEmbeddingRow {
  id: string;
  lastRssRecordId: string;
  title: string;
  description: string | null;
  seniority: string | null;
  workFormat: string | null;
  embeddingSourceHash: string | null;
  embeddingModel: string | null;
  publishedAt: Date | null;
  roleName: string | null;
  requiredSkills: string[];
}

interface CandidateRow {
  id: string;
  uniqueVacancyId: string | null;
  roleNodeId: string | null;
  seniority: string | null;
  workFormat: string | null;
  companyId: string | null;
  publishedAt: Date;
  title: string;
  requiredSkillIds: string[];
  similarity: number;
  /** sim to the candidate's group centroid; null if candidate has no group. */
  centroidSimilarity: number | null;
}

interface VacancyForResolve {
  id: string;
  lastRssRecordId: string;
  publishedAt: Date;
  embedding: number[];
  roleNodeId: string | null;
  seniority: string | null;
  workFormat: string | null;
  companyId: string | null;
  title: string;
  requiredSkillIds: string[];
  uniqueVacancyId: string | null;
  embeddingModel: string;
  storedEmbeddingModel: string | null;
  embeddingSourceHash: string | null;
}

type Transaction = Parameters<Parameters<DrizzleDB["transaction"]>[0]>[0];

@Injectable()
export class DedupService {
  private readonly logger = new Logger(DedupService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly openai: OpenAIEmbeddingsClient,
  ) {}

  // ═════════════════════════════════════════════════════════════
  // Embed phase — populates vacancies.embedding for all eligible
  // rows. Idempotent via embedding_source_hash: rerunning is cheap
  // when nothing has changed.
  // ═════════════════════════════════════════════════════════════
  async embedAll(opts: { force?: boolean } = {}): Promise<{
    processed: number;
    embedded: number;
    skipped: number;
  }> {
    const force = opts.force === true;
    let processed = 0;
    let embedded = 0;
    let skipped = 0;

    while (true) {
      const batch = await this.fetchEmbedBatch(EMBED_BATCH_SIZE, force);
      if (batch.length === 0) break;

      const prepared = batch
        .map((row) => {
          const input: EmbeddingTextInput = {
            title: row.title,
            roleName: row.roleName,
            seniority: row.seniority,
            workFormat: row.workFormat,
            requiredSkills: row.requiredSkills,
            description: row.description,
          };
          const { text, hash } = buildEmbeddingText(input);
          return { row, text, hash };
        })
        // Skip rows whose hash already matches and have a current-model
        // embedding — we already paid the OpenAI cost for those. `force`
        // bypasses this when we want to re-embed everything after model
        // changes.
        .filter(({ row, hash }) => {
          if (force) return true;
          if (row.embeddingSourceHash !== hash) return true;
          if (row.embeddingModel !== this.openai.model) return true;
          return false;
        });

      processed += batch.length;
      skipped += batch.length - prepared.length;

      if (prepared.length === 0) {
        // The whole batch was up-to-date. Move on — but the outer
        // SELECT only returns rows where embedding IS NULL or model
        // mismatches, so this branch only fires under `--force`.
        continue;
      }

      const vectors = await this.openai.embed(
        prepared.map((p) => p.text),
        EMBED_BATCH_SIZE,
      );

      for (let i = 0; i < prepared.length; i++) {
        const { row, hash } = prepared[i];
        const vec = vectors[i];
        if (!vec || vec.length !== EMBEDDING_DIMENSIONS) {
          throw new Error(
            `OpenAI returned a vector of length ${vec?.length ?? 0} for vacancy ${row.id}`,
          );
        }
        const [written] = await this.db
          .update(schema.vacancies)
          .set({
            embedding: vec,
            embeddingModel: this.openai.model,
            embeddingSourceHash: hash,
          })
          .where(
            and(
              eq(schema.vacancies.id, row.id),
              eq(schema.vacancies.lastRssRecordId, row.lastRssRecordId),
            ),
          )
          .returning({ id: schema.vacancies.id });
        if (written) embedded++;
        else skipped++;
      }

      this.logger.log(`embedded ${embedded}/${processed} (skipped ${skipped})`);
    }

    return { processed, embedded, skipped };
  }

  private async fetchEmbedBatch(limit: number, force: boolean): Promise<VacancyEmbeddingRow[]> {
    // When not forcing, we only fetch rows that still need work:
    // either missing embedding or written by a stale model. Force
    // mode pulls everything so the in-JS hash check decides.
    const where = force
      ? sql`true`
      : sql`(v.embedding IS NULL OR v.embedding_model IS DISTINCT FROM ${this.openai.model})`;

    const rows = await this.db.execute<{
      id: string;
      last_rss_record_id: string;
      title: string;
      description: string | null;
      seniority: string | null;
      work_format: string | null;
      embedding_source_hash: string | null;
      embedding_model: string | null;
      published_at: Date | null;
      role_name: string | null;
      required_skills: string[] | null;
    }>(sql`
      SELECT
        v.id,
        v.last_rss_record_id,
        v.title,
        v.description,
        v.seniority::text AS seniority,
        v.work_format::text AS work_format,
        v.embedding_source_hash,
        v.embedding_model,
        v.published_at,
        role_node.canonical_name AS role_name,
        COALESCE(
          array_agg(DISTINCT skill_node.canonical_name)
            FILTER (WHERE skill_node.canonical_name IS NOT NULL),
          ARRAY[]::text[]
        ) AS required_skills
      FROM vacancies v
      LEFT JOIN nodes role_node ON role_node.id = v.role_node_id
      LEFT JOIN vacancy_nodes vn ON vn.vacancy_id = v.id AND vn.is_required = true
      LEFT JOIN nodes skill_node ON skill_node.id = vn.node_id
      WHERE ${where}
      GROUP BY v.id, role_node.canonical_name
      ORDER BY v.published_at ASC NULLS LAST, v.id ASC
      LIMIT ${limit}
    `);

    return rows.rows.map((r) => ({
      id: r.id,
      lastRssRecordId: r.last_rss_record_id,
      title: r.title,
      description: r.description,
      seniority: r.seniority,
      workFormat: r.work_format,
      embeddingSourceHash: r.embedding_source_hash,
      embeddingModel: r.embedding_model,
      publishedAt: r.published_at,
      roleName: r.role_name,
      requiredSkills: Array.isArray(r.required_skills) ? r.required_skills : [],
    }));
  }

  // ═════════════════════════════════════════════════════════════
  // Resolve phase — assigns vacancies to UniqueVacancy groups.
  // Iterates strictly in published_at ASC order so each decision
  // operates on the already-resolved history below. Skipping the
  // already-resolved keeps the loop idempotent on re-runs.
  // ═════════════════════════════════════════════════════════════
  async resolveAll(): Promise<{ processed: number; assigned: number }> {
    const queue = await this.db.execute<{ id: string }>(sql`
      SELECT id
      FROM vacancies
      WHERE embedding IS NOT NULL
        AND unique_vacancy_id IS NULL
        AND published_at IS NOT NULL
      ORDER BY published_at ASC, id ASC
    `);

    let processed = 0;
    let assigned = 0;
    const total = queue.rows.length;

    for (const { id } of queue.rows) {
      processed++;
      const result = await this.resolveOne(id);
      if (result?.action === "joined") assigned++;
      if (processed % 100 === 0) {
        this.logger.log(`resolve ${processed}/${total}`);
      }
    }

    return { processed, assigned };
  }

  private async resolveOne(
    vacancyId: string,
  ): Promise<{ action: "joined" | "new_group"; uniqueVacancyId: string } | null> {
    const v = await this.loadVacancyForResolve(vacancyId);
    if (!v) return null;
    if (v.uniqueVacancyId) return null;

    const windowStart = new Date(v.publishedAt.getTime() - PREFILTER_DATE_WINDOW_DAYS * 86_400_000);
    const windowEnd = new Date(v.publishedAt.getTime() + PREFILTER_DATE_WINDOW_DAYS * 86_400_000);
    const embeddingLiteral = sql`${vectorLiteral(v.embedding)}::vector(${sql.raw(String(EMBEDDING_DIMENSIONS))})`;

    const candRes = await this.db.execute<{
      id: string;
      unique_vacancy_id: string | null;
      role_node_id: string | null;
      seniority: string | null;
      work_format: string | null;
      company_id: string | null;
      published_at: Date;
      title: string;
      required_skill_ids: string[] | null;
      similarity: string;
      centroid_similarity: string | null;
    }>(sql`
      SELECT
        cand.id,
        cand.unique_vacancy_id,
        cand.role_node_id,
        cand.seniority::text AS seniority,
        cand.work_format::text AS work_format,
        cand.company_id,
        cand.published_at,
        cand.title,
        ${requiredSkillIdsSubquery(sql`cand.id`)} AS required_skill_ids,
        (1 - (cand.embedding <=> ${embeddingLiteral}))::text AS similarity,
        CASE
          WHEN uv.centroid_embedding IS NULL THEN NULL
          ELSE (1 - (uv.centroid_embedding <=> ${embeddingLiteral}))::text
        END AS centroid_similarity
      FROM vacancies cand
      LEFT JOIN unique_vacancies uv ON uv.id = cand.unique_vacancy_id
      -- Same-source allowed: a board reposting a job under a new id is a true
      -- duplicate; the 0.92 threshold + gates keep distinct openings apart.
      WHERE cand.id != ${v.id}
        AND cand.embedding IS NOT NULL
        AND cand.published_at IS NOT NULL
        AND cand.published_at BETWEEN ${windowStart} AND ${windowEnd}
        -- Hard structural gates: when BOTH sides know a field, they must
        -- agree. Null-permissive so a missing extraction on one side
        -- doesn't kill the match. role + seniority are the primary
        -- defense against boilerplate-driven snowballs (e.g. SKELAR
        -- products sharing intro text across Backend/Frontend postings
        -- and seniority levels).
        AND (
          cand.role_node_id IS NULL
          OR ${v.roleNodeId}::uuid IS NULL
          OR cand.role_node_id = ${v.roleNodeId}::uuid
        )
        AND (
          cand.seniority IS NULL
          OR ${v.seniority}::text IS NULL
          OR cand.seniority::text = ${v.seniority}
        )
        -- Negative company gate: if both sides resolved a company and
        -- they differ, it cannot be the same posting — this splits
        -- distinct products inside one holding (the SKELAR ecosystem).
        AND NOT (
          cand.company_id IS NOT NULL
          AND ${v.companyId}::uuid IS NOT NULL
          AND cand.company_id != ${v.companyId}::uuid
        )
      ORDER BY cand.embedding <=> ${embeddingLiteral}
      LIMIT ${PREFILTER_TOP_N}
    `);

    const candidates: CandidateRow[] = candRes.rows.map((r) => ({
      id: r.id,
      uniqueVacancyId: r.unique_vacancy_id,
      roleNodeId: r.role_node_id,
      seniority: r.seniority,
      workFormat: r.work_format,
      companyId: r.company_id,
      publishedAt: toDate(r.published_at),
      title: r.title,
      requiredSkillIds: Array.isArray(r.required_skill_ids) ? r.required_skill_ids : [],
      similarity: Number(r.similarity),
      centroidSimilarity: r.centroid_similarity !== null ? Number(r.centroid_similarity) : null,
    }));

    // We can only "join" candidates that are already in a group —
    // resolveAll walks chronologically, so earlier vacancies are
    // already resolved when later ones reach back to them.
    //
    // Join gate is BOTH pairwise AND centroid similarity ≥ HARD.
    // Either alone leaks: pairwise-only snowballs via boilerplate
    // chains, centroid-only drifts when an established group's
    // average happens to track the shared boilerplate. The AND
    // forces "this vacancy looks like a specific member AND like
    // the group as a whole" — eliminates SKELAR-ecosystem snowball
    // observed in earlier passes.
    //
    // Sole-member groups: centroid == canonical's embedding, so
    // centroid_sim collapses to the canonical pairwise. The
    // additional gate is effectively a no-op there.
    const eligible = candidates.filter(
      (c) =>
        c.uniqueVacancyId &&
        c.similarity >= HARD_THRESHOLD &&
        c.centroidSimilarity !== null &&
        c.centroidSimilarity >= HARD_THRESHOLD,
    );
    // Bucket by group: choose the group with the best centroid sim,
    // then within that group keep the highest-pairwise candidate as
    // the `matchedAgainstVacancyId` for the "why merged" UI.
    const bestGroup = pickBestGroup(eligible);
    const best = bestGroup
      ? eligible
          .filter((c) => c.uniqueVacancyId === bestGroup)
          .sort((a, b) => b.similarity - a.similarity)[0]
      : undefined;

    if (!best) {
      const groupId = await this.createGroup(v);
      if (!groupId) return null;
      return { action: "new_group", uniqueVacancyId: groupId };
    }

    const groupId = best.uniqueVacancyId!;

    // Structural corroboration of the chosen pair. The merge already
    // passed every gate; this decides whether it is gold-tier — a high
    // semantic score backed by at least one independent structural
    // signal, so similarity alone is never the sole justification.
    const companyMatch =
      v.companyId !== null && best.companyId !== null && v.companyId === best.companyId;
    const skillJaccard = jaccard(v.requiredSkillIds, best.requiredSkillIds);
    const titleJaccard = jaccard(titleTokens(v.title), titleTokens(best.title));
    const isGold =
      best.similarity >= GOLD_THRESHOLD &&
      (best.centroidSimilarity ?? 0) >= GOLD_THRESHOLD &&
      (companyMatch || skillJaccard >= SKILL_JACCARD_GOLD || titleJaccard >= TITLE_JACCARD_GOLD);

    const reason: DedupReason = {
      similarity: best.similarity,
      matchedAgainstVacancyId: best.id,
      prefilterMatches: {
        role: triBool(v.roleNodeId, best.roleNodeId),
        seniority: triBool(v.seniority, best.seniority),
        workFormat: triBool(v.workFormat, best.workFormat),
        company: triBool(v.companyId, best.companyId),
        dateWindowDays: Math.round(
          Math.abs((v.publishedAt.getTime() - best.publishedAt.getTime()) / 86_400_000),
        ),
      },
      confidence: isGold ? "gold" : "confirmed",
      corroboration: {
        skillJaccard: round2(skillJaccard),
        titleJaccard: round2(titleJaccard),
        companyMatch,
      },
      embeddingModel: v.embeddingModel,
      decidedAt: new Date().toISOString(),
    };

    const joined = await this.joinGroup(v, groupId, reason);
    if (!joined) return null;
    return { action: "joined", uniqueVacancyId: groupId };
  }

  private async loadVacancyForResolve(vacancyId: string): Promise<VacancyForResolve | null> {
    const res = await this.db.execute<{
      id: string;
      last_rss_record_id: string;
      published_at: Date;
      embedding: string;
      role_node_id: string | null;
      seniority: string | null;
      work_format: string | null;
      company_id: string | null;
      title: string;
      required_skill_ids: string[] | null;
      unique_vacancy_id: string | null;
      embedding_model: string | null;
      embedding_source_hash: string | null;
    }>(sql`
      SELECT
        v.id,
        v.last_rss_record_id,
        v.published_at,
        v.embedding::text AS embedding,
        v.role_node_id,
        v.seniority::text AS seniority,
        v.work_format::text AS work_format,
        v.company_id,
        v.title,
        ${requiredSkillIdsSubquery(sql`v.id`)} AS required_skill_ids,
        v.unique_vacancy_id,
        v.embedding_model,
        v.embedding_source_hash
      FROM vacancies v
      WHERE v.id = ${vacancyId}
    `);
    const r = res.rows[0];
    if (!r) return null;
    return {
      id: r.id,
      lastRssRecordId: r.last_rss_record_id,
      publishedAt: toDate(r.published_at),
      embedding: parseVectorText(r.embedding),
      roleNodeId: r.role_node_id,
      seniority: r.seniority,
      workFormat: r.work_format,
      companyId: r.company_id,
      title: r.title,
      requiredSkillIds: Array.isArray(r.required_skill_ids) ? r.required_skill_ids : [],
      uniqueVacancyId: r.unique_vacancy_id,
      embeddingModel: r.embedding_model ?? this.openai.model,
      storedEmbeddingModel: r.embedding_model,
      embeddingSourceHash: r.embedding_source_hash,
    };
  }

  private async createGroup(v: VacancyForResolve): Promise<string | null> {
    return this.db.transaction(async (tx) => {
      if (!(await this.lockCurrentResolveVersion(v, tx))) return null;

      const [group] = await tx
        .insert(schema.uniqueVacancies)
        .values({
          canonicalVacancyId: v.id,
          centroidEmbedding: v.embedding,
          sourceCount: 1,
          vacancyCount: 1,
          firstSeenAt: v.publishedAt,
          lastSeenAt: v.publishedAt,
        })
        .returning({ id: schema.uniqueVacancies.id });
      await tx
        .update(schema.vacancies)
        .set({ uniqueVacancyId: group.id, dedupReason: null })
        .where(eq(schema.vacancies.id, v.id));
      return group.id;
    });
  }

  private async joinGroup(
    v: VacancyForResolve,
    groupId: string,
    reason: DedupReason,
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      if (!(await this.lockCurrentResolveVersion(v, tx))) return false;

      const group = await tx.execute<{ id: string }>(sql`
        SELECT id FROM unique_vacancies WHERE id = ${groupId} FOR UPDATE
      `);
      if (!group.rows[0]) return false;

      await tx
        .update(schema.vacancies)
        .set({
          uniqueVacancyId: groupId,
          dedupReason: reason,
        })
        .where(eq(schema.vacancies.id, v.id));

      // Recompute group-level aggregates from scratch over current
      // members — keeps the column honest without race-prone deltas.
      await tx.execute(sql`
        UPDATE unique_vacancies u
        SET
          centroid_embedding = sub.centroid,
          source_count = sub.source_count,
          vacancy_count = sub.vacancy_count,
          last_seen_at = sub.last_seen_at,
          updated_at = now()
        FROM (
          SELECT
            AVG(v.embedding)                         AS centroid,
            COUNT(DISTINCT v.source_id)::int         AS source_count,
            COUNT(*)::int                            AS vacancy_count,
            MAX(v.published_at)                      AS last_seen_at
          FROM vacancies v
          WHERE v.unique_vacancy_id = ${groupId}
            AND v.embedding IS NOT NULL
        ) sub
        WHERE u.id = ${groupId}
      `);
      return true;
    });
  }

  private async lockCurrentResolveVersion(
    vacancy: VacancyForResolve,
    tx: Transaction,
  ): Promise<boolean> {
    const result = await tx.execute<{ id: string }>(sql`
      SELECT id
      FROM vacancies
      WHERE id = ${vacancy.id}
        AND last_rss_record_id = ${vacancy.lastRssRecordId}
        AND embedding IS NOT NULL
        AND embedding_model IS NOT DISTINCT FROM ${vacancy.storedEmbeddingModel}
        AND embedding_source_hash IS NOT DISTINCT FROM ${vacancy.embeddingSourceHash}
        AND unique_vacancy_id IS NULL
      FOR UPDATE
    `);
    return result.rows.length > 0;
  }

  // ═════════════════════════════════════════════════════════════
  // Reset — drop all groupings (and the groups themselves). Used
  // by `dedup:reset` for deterministic re-runs while we calibrate.
  // ═════════════════════════════════════════════════════════════
  async resetAll(): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`
        UPDATE vacancies
        SET unique_vacancy_id = NULL,
            dedup_reason = NULL
      `);
      await tx.execute(sql`DELETE FROM unique_vacancies`);
    });
  }

  // ═════════════════════════════════════════════════════════════
  // Read-side — feeds the operator dashboard. Drops the mock and
  // queries the populated tables directly. Same response shape as
  // `dedup.mock.ts`, so the frontend doesn't change.
  // ═════════════════════════════════════════════════════════════
  async listGroups(query: UniqueVacanciesQuery): Promise<UniqueVacanciesResponse> {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: SQL[] = [];
    if (query.crossSource === true) {
      conditions.push(sql`u.source_count >= 2`);
    }
    if (query.minSimilarity !== undefined) {
      conditions.push(sql`(min_sim.value IS NULL OR min_sim.value >= ${query.minSimilarity})`);
    }
    if (query.confidence === "gold") {
      // Every non-canonical edge is gold-tier — the clean demo list.
      conditions.push(sql`tier.edge_count > 0 AND tier.edge_count = tier.gold_count`);
    } else if (query.confidence === "confirmed") {
      // At least one edge is only confirmed-tier — needs a closer look.
      conditions.push(sql`tier.edge_count > 0 AND tier.edge_count > tier.gold_count`);
    }
    const whereClause =
      conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

    // min_sim per group = lowest similarityToCentroid among non-canonical
    // members. Solo groups get null (no edges yet).
    const baseFrom = sql`
      FROM unique_vacancies u
      LEFT JOIN LATERAL (
        SELECT MIN(
          1 - (v.embedding <=> u.centroid_embedding)
        )::numeric AS value
        FROM vacancies v
        WHERE v.unique_vacancy_id = u.id
          AND v.id != u.canonical_vacancy_id
          AND v.embedding IS NOT NULL
      ) min_sim ON true
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (
            WHERE v.id != u.canonical_vacancy_id
          ) AS edge_count,
          COUNT(*) FILTER (
            WHERE v.id != u.canonical_vacancy_id
              AND v.dedup_reason->>'confidence' = 'gold'
          ) AS gold_count
        FROM vacancies v
        WHERE v.unique_vacancy_id = u.id
      ) tier ON true
    `;

    const totalRes = await this.db.execute<{ count: string }>(sql`
      SELECT COUNT(*)::text AS count
      ${baseFrom}
      ${whereClause}
    `);
    const total = Number(totalRes.rows[0]?.count ?? 0);

    const groupRows = await this.db.execute<{
      id: string;
      canonical_vacancy_id: string;
      source_count: number;
      vacancy_count: number;
      first_seen_at: Date;
      last_seen_at: Date;
      min_similarity: string | null;
    }>(sql`
      SELECT
        u.id,
        u.canonical_vacancy_id,
        u.source_count,
        u.vacancy_count,
        u.first_seen_at,
        u.last_seen_at,
        min_sim.value::text AS min_similarity
      ${baseFrom}
      ${whereClause}
      ORDER BY u.source_count DESC, u.vacancy_count DESC, u.last_seen_at DESC
      LIMIT ${pageSize}
      OFFSET ${offset}
    `);

    if (groupRows.rows.length === 0) {
      return {
        metrics: await this.getMetrics(),
        items: [],
        pagination: { page, pageSize, total },
      };
    }

    const groupIds = groupRows.rows.map((g) => g.id);
    const memberRes = await this.fetchMembersForGroups(groupIds);

    const itemsById = new Map<string, UniqueVacancyListItem>();
    for (const g of groupRows.rows) {
      itemsById.set(g.id, {
        id: g.id,
        canonicalVacancyId: g.canonical_vacancy_id,
        title: "",
        companyName: null,
        role: null,
        seniority: null,
        workFormat: null,
        salaryRange: null,
        sources: [],
        sourceCount: g.source_count,
        vacancyCount: g.vacancy_count,
        firstSeenAt: toDate(g.first_seen_at).toISOString(),
        lastSeenAt: toDate(g.last_seen_at).toISOString(),
        minSimilarity: g.min_similarity !== null ? Number(g.min_similarity) : null,
        members: [],
      });
    }

    const sourcesByGroup = new Map<string, Map<string, SourceBadge>>();

    for (const m of memberRes) {
      const item = itemsById.get(m.uniqueVacancyId);
      if (!item) continue;
      const member: UniqueVacancyMember = {
        vacancyId: m.id,
        source: m.source,
        externalId: m.externalId,
        externalUrl: m.externalUrl,
        title: m.title,
        publishedAt: m.publishedAt ? toDate(m.publishedAt).toISOString() : null,
        isCanonical: m.id === item.canonicalVacancyId,
        similarityToCentroid: m.similarityToCentroid,
        dedupReason: m.dedupReason,
      };
      item.members.push(member);

      if (member.isCanonical) {
        item.title = m.title;
        item.companyName = m.companyName;
        item.role = m.roleName;
        item.seniority = m.seniority as never;
        item.workFormat = m.workFormat as never;
        if (m.salaryMin !== null || m.salaryMax !== null || m.currency) {
          item.salaryRange = {
            min: m.salaryMin,
            max: m.salaryMax,
            currency: (m.currency as never) ?? null,
          };
        }
      }

      let bucket = sourcesByGroup.get(m.uniqueVacancyId);
      if (!bucket) {
        bucket = new Map();
        sourcesByGroup.set(m.uniqueVacancyId, bucket);
      }
      bucket.set(m.source.id, m.source);
    }

    for (const [groupId, bucket] of sourcesByGroup) {
      const item = itemsById.get(groupId);
      if (!item) continue;
      item.sources = Array.from(bucket.values()).sort((a, b) => a.code.localeCompare(b.code));
      item.members.sort((a, b) => {
        if (a.isCanonical) return -1;
        if (b.isCanonical) return 1;
        return (b.similarityToCentroid ?? 0) - (a.similarityToCentroid ?? 0);
      });
    }

    return {
      metrics: await this.getMetrics(),
      items: groupRows.rows.map((g) => itemsById.get(g.id)!),
      pagination: { page, pageSize, total },
    };
  }

  // Public, feed-facing single-group read — backs the "show duplicates" drawer
  // on the main feed. Same member shape + "why merged" reasons as the operator
  // dashboard, minus the metrics/pagination envelope. Returns null for an
  // unknown id. Reuses fetchMembersForGroups so the projection never drifts.
  async getGroupForFeed(uniqueVacancyId: string): Promise<FeedDuplicateGroup | null> {
    const [grp] = await this.db
      .select({
        id: schema.uniqueVacancies.id,
        canonicalVacancyId: schema.uniqueVacancies.canonicalVacancyId,
        vacancyCount: schema.uniqueVacancies.vacancyCount,
        sourceCount: schema.uniqueVacancies.sourceCount,
      })
      .from(schema.uniqueVacancies)
      .where(eq(schema.uniqueVacancies.id, uniqueVacancyId))
      .limit(1);
    if (!grp) return null;

    const members: UniqueVacancyMember[] = (await this.fetchMembersForGroups([uniqueVacancyId]))
      .map((m) => ({
        vacancyId: m.id,
        source: m.source,
        externalId: m.externalId,
        externalUrl: m.externalUrl,
        title: m.title,
        publishedAt: m.publishedAt ? toDate(m.publishedAt).toISOString() : null,
        isCanonical: m.id === grp.canonicalVacancyId,
        similarityToCentroid: m.similarityToCentroid,
        dedupReason: m.dedupReason,
      }))
      .sort((a, b) => {
        if (a.isCanonical) return -1;
        if (b.isCanonical) return 1;
        return (b.similarityToCentroid ?? 0) - (a.similarityToCentroid ?? 0);
      });

    return {
      id: grp.id,
      canonicalVacancyId: grp.canonicalVacancyId,
      vacancyCount: grp.vacancyCount,
      sourceCount: grp.sourceCount,
      members,
    };
  }

  private async fetchMembersForGroups(groupIds: string[]): Promise<
    Array<{
      uniqueVacancyId: string;
      id: string;
      title: string;
      externalId: string;
      externalUrl: string | null;
      publishedAt: Date | null;
      similarityToCentroid: number | null;
      dedupReason: DedupReason | null;
      source: SourceBadge;
      companyName: string | null;
      roleName: string | null;
      seniority: string | null;
      workFormat: string | null;
      salaryMin: number | null;
      salaryMax: number | null;
      currency: string | null;
    }>
  > {
    if (groupIds.length === 0) return [];
    const res = await this.db.execute<{
      unique_vacancy_id: string;
      id: string;
      title: string;
      external_id: string;
      external_url: string | null;
      published_at: Date | null;
      similarity_to_centroid: string | null;
      dedup_reason: DedupReason | null;
      source_id: string;
      source_code: string;
      source_display_name: string;
      company_name: string | null;
      role_name: string | null;
      seniority: string | null;
      work_format: string | null;
      salary_min: number | null;
      salary_max: number | null;
      currency: string | null;
    }>(sql`
      SELECT
        v.unique_vacancy_id,
        v.id,
        v.title,
        v.external_id,
        rr.link AS external_url,
        v.published_at,
        CASE
          WHEN v.id = u.canonical_vacancy_id THEN NULL
          ELSE (1 - (v.embedding <=> u.centroid_embedding))::text
        END AS similarity_to_centroid,
        v.dedup_reason,
        s.id AS source_id,
        s.code AS source_code,
        s.display_name AS source_display_name,
        c.name AS company_name,
        role_node.canonical_name AS role_name,
        v.seniority::text AS seniority,
        v.work_format::text AS work_format,
        v.salary_min,
        v.salary_max,
        v.currency::text AS currency
      FROM vacancies v
      JOIN unique_vacancies u ON u.id = v.unique_vacancy_id
      JOIN sources s ON s.id = v.source_id
      LEFT JOIN rss_records rr ON rr.id = v.last_rss_record_id
      LEFT JOIN companies c ON c.id = v.company_id
      LEFT JOIN nodes role_node ON role_node.id = v.role_node_id
      WHERE v.unique_vacancy_id IN (${sql.join(
        groupIds.map((id) => sql`${id}`),
        sql`, `,
      )})
    `);

    return res.rows.map((r) => ({
      uniqueVacancyId: r.unique_vacancy_id,
      id: r.id,
      title: r.title,
      externalId: r.external_id,
      externalUrl: r.external_url,
      publishedAt: r.published_at,
      similarityToCentroid:
        r.similarity_to_centroid !== null ? Number(r.similarity_to_centroid) : null,
      dedupReason: r.dedup_reason,
      source: {
        id: r.source_id,
        code: r.source_code,
        displayName: r.source_display_name,
      },
      companyName: r.company_name,
      roleName: r.role_name,
      seniority: r.seniority,
      workFormat: r.work_format,
      salaryMin: r.salary_min,
      salaryMax: r.salary_max,
      currency: r.currency,
    }));
  }

  async getMetrics(): Promise<DedupMetrics> {
    const groupAgg = await this.db.execute<{
      total_groups: string;
      cross_source_groups: string;
      avg_group_size: string | null;
    }>(sql`
      SELECT
        COUNT(*)::text                                  AS total_groups,
        COUNT(*) FILTER (WHERE source_count >= 2)::text AS cross_source_groups,
        AVG(vacancy_count)::text                        AS avg_group_size
      FROM unique_vacancies
    `);
    const ga = groupAgg.rows[0];
    const totalGroups = Number(ga?.total_groups ?? 0);
    const crossSourceGroups = Number(ga?.cross_source_groups ?? 0);
    const avgGroupSize = ga?.avg_group_size ? Number(ga.avg_group_size) : 0;

    const vacAgg = await this.db.execute<{
      total_vacancies: string;
      in_cross_source: string;
    }>(sql`
      SELECT
        COUNT(*)::text AS total_vacancies,
        COUNT(*) FILTER (
          WHERE unique_vacancy_id IN (
            SELECT id FROM unique_vacancies WHERE source_count >= 2
          )
        )::text AS in_cross_source
      FROM vacancies
    `);
    const va = vacAgg.rows[0];
    const totalVacancies = Number(va?.total_vacancies ?? 0);
    const vacanciesInCrossSourceGroups = Number(va?.in_cross_source ?? 0);

    const bucketRes = await this.db.execute<{
      soft: string;
      hard: string;
      very_hard: string;
    }>(sql`
      SELECT
        COUNT(*) FILTER (WHERE sim >= 0.85 AND sim < 0.92)::text AS soft,
        COUNT(*) FILTER (WHERE sim >= 0.92 AND sim < 0.95)::text AS hard,
        COUNT(*) FILTER (WHERE sim >= 0.95)::text                AS very_hard
      FROM (
        SELECT ((dedup_reason->>'similarity')::numeric) AS sim
        FROM vacancies
        WHERE dedup_reason IS NOT NULL
      ) buckets
    `);
    const b = bucketRes.rows[0];

    const sourceRes = await this.db.execute<{
      code: string;
      display_name: string;
      vacancy_count: string;
      in_cross_source: string;
    }>(sql`
      SELECT
        s.code,
        s.display_name,
        COUNT(v.id)::text AS vacancy_count,
        COUNT(*) FILTER (
          WHERE v.unique_vacancy_id IN (
            SELECT id FROM unique_vacancies WHERE source_count >= 2
          )
        )::text AS in_cross_source
      FROM sources s
      LEFT JOIN vacancies v ON v.source_id = s.id
      GROUP BY s.code, s.display_name
      ORDER BY s.code
    `);

    return {
      totalGroups,
      crossSourceGroups,
      crossSourceRatio: totalGroups > 0 ? crossSourceGroups / totalGroups : 0,
      totalVacancies,
      vacanciesInCrossSourceGroups,
      avgGroupSize: round2(avgGroupSize),
      similarityBuckets: {
        soft: Number(b?.soft ?? 0),
        hard: Number(b?.hard ?? 0),
        veryHard: Number(b?.very_hard ?? 0),
      },
      sourceBreakdown: sourceRes.rows.map((r) => ({
        sourceCode: r.code,
        sourceDisplayName: r.display_name,
        vacancyCount: Number(r.vacancy_count),
        inCrossSourceGroupCount: Number(r.in_cross_source),
      })),
    };
  }
}

// ─────────────────────────── Helpers ───────────────────────────

function triBool(a: unknown, b: unknown): boolean | null {
  if (a == null || b == null) return null;
  return a === b;
}

// SQL fragment: required-skill node ids for a vacancy as a uuid[]. Used in
// both the candidate query and the single-vacancy load so skill overlap can
// be scored without an extra round-trip.
function requiredSkillIdsSubquery(vacancyIdExpr: SQL): SQL {
  return sql`COALESCE(
    (SELECT array_agg(vn.node_id)
     FROM vacancy_nodes vn
     WHERE vn.vacancy_id = ${vacancyIdExpr}
       AND vn.is_required = true),
    ARRAY[]::uuid[]
  )`;
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const x of setA) if (setB.has(x)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// Connector words that carry no role signal — dropped so two titles like
// "Backend Engineer at Acme" / "Backend Engineer" still overlap fully.
const TITLE_STOPWORDS = new Set([
  "at",
  "the",
  "a",
  "an",
  "for",
  "to",
  "of",
  "and",
  "with",
  "in",
  "on",
  "в",
  "у",
  "для",
  "та",
  "і",
  "до",
  "на",
]);

function titleTokens(title: string): string[] {
  return title
    .toLowerCase()
    .split(/[^a-z0-9а-яёїієґ]+/i)
    .filter((t) => t.length >= 2 && !TITLE_STOPWORDS.has(t));
}

function vectorLiteral(vec: number[]): string {
  // pgvector text format is `[1,2,3]`. JSON.stringify produces the
  // same shape; we just have to make sure numbers don't render as
  // `1.2e-5` because pgvector accepts standard decimal form but
  // not all clients agree on scientific notation.
  return `[${vec.map((n) => n.toString()).join(",")}]`;
}

function pickBestGroup(eligible: CandidateRow[]): string | null {
  // Group sims aren't unique per row (each candidate carries its own
  // group's centroid_sim), so take the max centroid_sim per groupId.
  let best: { groupId: string; centroidSim: number } | null = null;
  for (const c of eligible) {
    if (!c.uniqueVacancyId || c.centroidSimilarity === null) continue;
    if (!best || c.centroidSimilarity > best.centroidSim) {
      best = { groupId: c.uniqueVacancyId, centroidSim: c.centroidSimilarity };
    }
  }
  return best?.groupId ?? null;
}

function toDate(v: Date | string | number): Date {
  // node-postgres' default type parsers convert timestamptz to JS Date,
  // but Drizzle's raw `execute(sql\`...\`)` path on this version sometimes
  // bypasses those parsers and the value arrives as an ISO string. Coerce
  // defensively so the rest of the service can rely on Date arithmetic.
  return v instanceof Date ? v : new Date(v);
}

function parseVectorText(s: string): number[] {
  // Output of `column::text` for vector type is `[1,2,3]`.
  const trimmed = s.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    throw new Error(`Unexpected vector text format: ${trimmed.slice(0, 80)}`);
  }
  return trimmed
    .slice(1, -1)
    .split(",")
    .map((p) => Number(p.trim()));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
