import { randomUUID } from "node:crypto";

import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";

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
import {
  allPairs,
  diffPartitions,
  linksFor,
  matchContext,
  pairKey,
  sameSourceViolations,
  targetPartition,
} from "./partition";
import {
  findGroupMembers,
  findNeighbours,
  findSameFingerprint,
  insertDifferentOverrides,
  loadOverrides,
  loadPostings,
  StalePartitionError,
  writePartition,
  type PartitionEntry,
  type PostingRow,
} from "./partition.repository";
import { buildPlanReport, type PlanReport } from "./plan-report";

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

export interface PartitionFile {
  kind: "target" | "current";
  builtAt: string;
  entries: PartitionEntry[];
}

export interface PlanOutput {
  report: PlanReport;
  target: PartitionFile;
  current: PartitionFile;
}

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

    // Keyset cursor, required in force mode: its WHERE is `true`, and writing a
    // row does not change that, so an offset-less LIMIT re-fetches the same first
    // page forever — an infinite loop that bills one batch of embeddings per turn.
    let afterId: string | null = null;

    while (true) {
      const batch = await this.fetchEmbedBatch(EMBED_BATCH_SIZE, force, afterId);
      if (batch.length === 0) break;
      afterId = batch[batch.length - 1].id;

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

  private async fetchEmbedBatch(
    limit: number,
    force: boolean,
    afterId: string | null = null,
  ): Promise<VacancyEmbeddingRow[]> {
    // When not forcing, we only fetch rows that still need work:
    // either missing embedding or written by a stale model. Force
    // mode pulls everything so the in-JS hash check decides.
    const where = force
      ? sql`true`
      : sql`(v.embedding IS NULL OR v.embedding_model IS DISTINCT FROM ${this.openai.model})`;
    // Ordering is by id alone so the cursor is a single comparable column. A full
    // sweep has no reason to care about publication order.
    const after = afterId === null ? sql`` : sql`AND v.id > ${afterId}::uuid`;

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
      WHERE ${where} ${after}
      GROUP BY v.id, role_node.canonical_name
      ORDER BY v.id ASC
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
  // Sweep — each pending vacancy rebuilds its affected set: itself, its
  // group, and the groups of its candidates. Same rules and clustering as
  // the full rebuild, so an edited vacancy is split out on its next resolve.
  // ═════════════════════════════════════════════════════════════
  async resolveAll(): Promise<{
    processed: number;
    resolved: number;
    stale: number;
    sameSourceViolations: number;
  }> {
    const queue = await this.db.execute<{ id: string }>(sql`
      SELECT id
      FROM vacancies
      WHERE embedding IS NOT NULL
        AND deduplicated_at IS NULL
      ORDER BY COALESCE(published_at, loaded_at) ASC, id ASC
    `);

    const totals = { processed: 0, resolved: 0, stale: 0, sameSourceViolations: 0 };
    for (const { id } of queue.rows) {
      totals.processed++;
      const result = await this.resolveOne(id);
      if (result === "stale") totals.stale++;
      else if (result) {
        totals.resolved++;
        totals.sameSourceViolations += result.sameSourceViolations;
      }
      if (totals.processed % 100 === 0) {
        this.logger.log(`resolve ${totals.processed}/${queue.rows.length}`);
      }
    }
    return totals;
  }

  private async resolveOne(
    vacancyId: string,
  ): Promise<{ sameSourceViolations: number } | "stale" | null> {
    const [pending] = await loadPostings(this.db, [vacancyId], { embeddings: false });
    // An earlier unit's affected set may already have resolved this one.
    if (!pending || !pending.hasEmbedding || pending.deduplicatedAt !== null) return null;

    const neighbours = await findNeighbours(this.db, [vacancyId]);
    const seeds = [
      vacancyId,
      ...neighbours.map((n) => n.b),
      ...(await findSameFingerprint(this.db, vacancyId)),
    ];
    const ids = [...new Set([...seeds, ...(await findGroupMembers(this.db, seeds))])];
    return this.rebuild(ids, (entries) => this.db.transaction((tx) => writePartition(tx, entries)));
  }

  private async rebuild(
    ids: readonly string[],
    write: (entries: PartitionEntry[]) => Promise<void>,
  ): Promise<{ sameSourceViolations: number; entries: PartitionEntry[] } | "stale"> {
    const rows = await loadPostings(this.db, ids, { embeddings: true });
    const embeddings = new Map<string, Float32Array>();
    for (const r of rows) if (r.embedding) embeddings.set(r.facts.id, r.embedding);
    const ctx = matchContext({ overrides: await loadOverrides(this.db, ids), embeddings });
    const facts = new Map(rows.map((r) => [r.facts.id, r.facts]));
    const links = linksFor(facts, allPairs([...facts.keys()]), ctx);
    const { entries, clusters } = targetPartition(rows, links, ctx, {
      newId: randomUUID,
      decidedAt: new Date().toISOString(),
    });
    try {
      await write(entries);
    } catch (err) {
      if (!(err instanceof StalePartitionError)) throw err;
      this.logger.warn(`dedup rebuild skipped, retry next sweep: ${err.message}`);
      return "stale";
    }
    return {
      entries,
      sameSourceViolations: sameSourceViolations(
        clusters.map((c) => c.cluster.members.map((m) => m.facts)),
        ctx,
      ),
    };
  }

  /**
   * Operator verdict: `vacancyId` is not the same job as any other member of
   * its group. The override outlives every future rebuild.
   */
  async detach(
    groupId: string,
    vacancyId: string,
    operatorUserId: string | null,
  ): Promise<{ groupId: string }> {
    const members = await this.db
      .select({ id: schema.vacancies.id })
      .from(schema.vacancies)
      .where(eq(schema.vacancies.uniqueVacancyId, groupId));
    const ids = members.map((m) => m.id);
    if (!ids.includes(vacancyId)) {
      throw new NotFoundException(`vacancy ${vacancyId} is not a member of group ${groupId}`);
    }
    const others = ids.filter((id) => id !== vacancyId);
    await insertDifferentOverrides(this.db, vacancyId, others, operatorUserId);

    const result = await this.rebuild(ids, (entries) =>
      this.db.transaction((tx) => writePartition(tx, entries)),
    );
    if (result === "stale") {
      throw new StalePartitionError("group changed while detaching; the override is saved, retry");
    }
    const mine = result.entries.find((e) => e.vacancyId === vacancyId);
    return { groupId: mine!.groupId };
  }

  // ═════════════════════════════════════════════════════════════
  // Full rebuild — `plan` is read-only; `apply` writes a plan file (or the
  // saved current partition, which is the rollback) in one transaction.
  // ═════════════════════════════════════════════════════════════
  async plan(): Promise<PlanOutput> {
    const builtAt = new Date().toISOString();
    const rows = await loadPostings(this.db, "all", { embeddings: false });
    this.logger.log(`plan: loaded ${rows.length} vacancies`);

    const embedded = rows.filter((r) => r.hasEmbedding).map((r) => r.facts.id);
    const neighbours = await findNeighbours(this.db, embedded, (done) => {
      if (done % 2000 === 0 || done === embedded.length) {
        this.logger.log(`plan: neighbours ${done}/${embedded.length}`);
      }
    });
    const cosines = new Map(neighbours.map((n) => [pairKey(n.a, n.b), n.cosine]));
    const pairs: Array<readonly [string, string]> = neighbours.map((n) => [n.a, n.b]);
    const byFingerprint = new Map<string, string[]>();
    for (const r of rows) {
      if (!r.facts.fingerprint) continue;
      const list = byFingerprint.get(r.facts.fingerprint) ?? [];
      list.push(r.facts.id);
      byFingerprint.set(r.facts.fingerprint, list);
    }
    for (const list of byFingerprint.values()) pairs.push(...allPairs(list));

    const ctx = matchContext({ overrides: await loadOverrides(this.db, "all"), cosines });
    const facts = new Map(rows.map((r) => [r.facts.id, r.facts]));
    const links = linksFor(facts, pairs, ctx);
    const { entries, clusters } = targetPartition(rows, links, ctx, {
      newId: randomUUID,
      decidedAt: builtAt,
    });

    const current = new Map(rows.map((r) => [r.facts.id, r.groupId]));
    const target = new Map(entries.map((e) => [e.vacancyId, e.groupId]));
    const currentGroups = new Map<string, PostingRow[]>();
    for (const r of rows) {
      const list = currentGroups.get(r.groupId) ?? [];
      list.push(r);
      currentGroups.set(r.groupId, list);
    }

    const report = buildPlanReport({
      builtAt,
      rows,
      diff: diffPartitions(current, target),
      currentGroups: [...currentGroups.values()],
      clusters,
      sentVacancyIds: await this.sentVacancyIds(),
      violationsBefore: sameSourceViolations(
        [...currentGroups.values()].map((g) => g.map((r) => r.facts)),
        ctx,
      ),
      violationsAfter: sameSourceViolations(
        clusters.map((c) => c.cluster.members.map((m) => m.facts)),
        ctx,
      ),
      linkCount: links.length,
      pairCount: pairs.length,
      names: await this.sourceAndCompanyNames(),
    });

    return {
      report,
      target: { kind: "target", builtAt, entries },
      current: {
        kind: "current",
        builtAt,
        entries: rows.map((r) => ({
          vacancyId: r.facts.id,
          groupId: r.groupId,
          version: r.version,
          dedupReason: r.dedupReason,
          deduplicatedAt: r.deduplicatedAt,
        })),
      },
    };
  }

  async apply(file: PartitionFile): Promise<{ written: number }> {
    const ids = new Set(file.entries.map((e) => e.vacancyId));
    if (ids.size !== file.entries.length) throw new Error("partition file lists a vacancy twice");
    await this.db.transaction(async (tx) => {
      const [{ count }] = (
        await tx.execute<{ count: string }>(sql`SELECT count(*)::text AS count FROM vacancies`)
      ).rows;
      if (Number(count) !== ids.size) {
        throw new StalePartitionError(
          `partition covers ${ids.size} vacancies, the database has ${count} — re-run plan`,
        );
      }
      await writePartition(tx, file.entries);
    });
    return { written: file.entries.length };
  }

  private async sentVacancyIds(): Promise<Set<string>> {
    const res = await this.db.execute<{ vacancy_id: string }>(
      sql`SELECT DISTINCT vacancy_id FROM sent_notifications`,
    );
    return new Set(res.rows.map((r) => r.vacancy_id));
  }

  private async sourceAndCompanyNames(): Promise<Map<string, string>> {
    const res = await this.db.execute<{ id: string; name: string }>(sql`
      SELECT id::text, code AS name FROM sources
      UNION ALL
      SELECT id::text, name FROM companies
    `);
    return new Map(res.rows.map((r) => [r.id, r.name]));
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
    const whereClause =
      conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

    const baseFrom = sql`FROM unique_vacancies u`;

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
    }>(sql`
      SELECT
        u.id,
        u.canonical_vacancy_id,
        u.source_count,
        u.vacancy_count,
        u.first_seen_at,
        u.last_seen_at
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
      item.members.sort(byCanonicalThenPublished);
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
        dedupReason: m.dedupReason,
      }))
      .sort(byCanonicalThenPublished);

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
      exact: string;
      repost: string;
      cross_source: string;
    }>(sql`
      SELECT
        COUNT(*)::text AS total_vacancies,
        COUNT(*) FILTER (
          WHERE unique_vacancy_id IN (
            SELECT id FROM unique_vacancies WHERE source_count >= 2
          )
        )::text AS in_cross_source,
        COUNT(*) FILTER (WHERE dedup_reason->>'rule' = 'exact')::text AS exact,
        COUNT(*) FILTER (WHERE dedup_reason->>'rule' = 'repost')::text AS repost,
        COUNT(*) FILTER (WHERE dedup_reason->>'rule' = 'cross_source')::text AS cross_source
      FROM vacancies
    `);
    const va = vacAgg.rows[0];

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
      totalVacancies: Number(va?.total_vacancies ?? 0),
      vacanciesInCrossSourceGroups: Number(va?.in_cross_source ?? 0),
      avgGroupSize: round2(avgGroupSize),
      ruleCounts: {
        exact: Number(va?.exact ?? 0),
        repost: Number(va?.repost ?? 0),
        crossSource: Number(va?.cross_source ?? 0),
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

function byCanonicalThenPublished(a: UniqueVacancyMember, b: UniqueVacancyMember): number {
  if (a.isCanonical !== b.isCanonical) return a.isCanonical ? -1 : 1;
  return (a.publishedAt ?? "").localeCompare(b.publishedAt ?? "");
}

function toDate(v: Date | string | number): Date {
  // Drizzle's raw `execute` path sometimes skips the timestamptz parser and
  // hands back an ISO string.
  return v instanceof Date ? v : new Date(v);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
