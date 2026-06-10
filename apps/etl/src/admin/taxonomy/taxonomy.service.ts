import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { sql, eq, and, inArray } from "drizzle-orm";
import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { normalizeAliasName } from "../../platform/shared/normalize-alias";

export type NodeTypeValue = "ROLE" | "SKILL" | "DOMAIN";
export type NodeStatusValue = "NEW" | "VERIFIED" | "HIDDEN";

const RENAME_MIN_LEN = 2;
export const AUTOVERIFY_MIN_VACANCIES = 5;
export const AUTOVERIFY_MIN_COMPANIES = 2;
export const TAXONOMY_LIST_DEFAULT = 50;
export const TAXONOMY_LIST_MAX = 200;

export interface NodeListFilters {
  type?: NodeTypeValue;
  statuses: NodeStatusValue[];
  q?: string;
  minBlocked: number;
  page: number;
  pageSize: number;
}

export interface NodeListItem {
  id: string;
  type: NodeTypeValue;
  canonicalName: string;
  status: NodeStatusValue;
  vacanciesBlocked: number;
  aliasCount: number;
}

export interface NodeListResult {
  items: NodeListItem[];
  page: number;
  pageSize: number;
  total: number;
}

type FuzzyThreshold = {
  minLen: number;
  minSim: number;
  // SKILL also requires word_similarity ≥ minWordSim to suppress
  // punctuation-driven false positives ("C" vs "C++").
  minWordSim?: number;
};

const FUZZY: Record<NodeTypeValue, FuzzyThreshold> = {
  ROLE: { minLen: 4, minSim: 0.55 },
  SKILL: { minLen: 3, minSim: 0.65, minWordSim: 0.5 },
  DOMAIN: { minLen: 4, minSim: 0.55 },
};

@Injectable()
export class TaxonomyService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async getCoverage() {
    const byAxis = await this.db.execute<{
      axis: string;
      verified: string;
      new_status: string;
      missing: string;
      total: string;
    }>(sql`
      SELECT 'role'::text AS axis,
        COUNT(*) FILTER (WHERE n.status = 'VERIFIED')::text AS verified,
        COUNT(*) FILTER (WHERE n.status = 'NEW')::text      AS new_status,
        COUNT(*) FILTER (WHERE v.role_node_id IS NULL)::text AS missing,
        COUNT(*)::text AS total
      FROM vacancies v LEFT JOIN nodes n ON n.id = v.role_node_id
      UNION ALL
      SELECT 'domain'::text,
        COUNT(*) FILTER (WHERE n.status = 'VERIFIED')::text,
        COUNT(*) FILTER (WHERE n.status = 'NEW')::text,
        COUNT(*) FILTER (WHERE v.domain_node_id IS NULL)::text,
        COUNT(*)::text
      FROM vacancies v LEFT JOIN nodes n ON n.id = v.domain_node_id
      UNION ALL
      SELECT 'skill'::text,
        COUNT(*) FILTER (WHERE n.status = 'VERIFIED')::text,
        COUNT(*) FILTER (WHERE n.status = 'NEW')::text,
        '0'::text,
        COUNT(*)::text
      FROM vacancy_nodes vn JOIN nodes n ON n.id = vn.node_id
    `);

    const fully = await this.db.execute<{ total: string; fully: string }>(sql`
      SELECT
        COUNT(*)::text AS total,
        COUNT(*) FILTER (
          WHERE (v.role_node_id IS NULL OR rn.status = 'VERIFIED')
            AND (v.domain_node_id IS NULL OR dn.status = 'VERIFIED')
            AND NOT EXISTS (
              SELECT 1 FROM vacancy_nodes vn
              JOIN nodes n ON n.id = vn.node_id
              WHERE vn.vacancy_id = v.id AND n.status <> 'VERIFIED'
            )
        )::text AS fully
      FROM vacancies v
      LEFT JOIN nodes rn ON rn.id = v.role_node_id
      LEFT JOIN nodes dn ON dn.id = v.domain_node_id
    `);

    const buckets = await this.db.execute<{
      bucket: string;
      vacancies: string;
      avg_skill_count: string;
    }>(sql`
      WITH per_vac AS (
        SELECT vn.vacancy_id,
               COUNT(*) AS total_skills,
               COUNT(*) FILTER (WHERE n.status = 'VERIFIED') AS verified_skills
        FROM vacancy_nodes vn JOIN nodes n ON n.id = vn.node_id
        GROUP BY vn.vacancy_id
      )
      SELECT
        CASE
          WHEN verified_skills::float / total_skills = 1 THEN '100'
          WHEN verified_skills::float / total_skills >= 0.75 THEN '75-99'
          WHEN verified_skills::float / total_skills >= 0.5  THEN '50-74'
          WHEN verified_skills::float / total_skills >= 0.25 THEN '25-49'
          WHEN verified_skills::float / total_skills > 0     THEN '1-24'
          ELSE '0'
        END AS bucket,
        COUNT(*)::text AS vacancies,
        ROUND(AVG(total_skills), 1)::text AS avg_skill_count
      FROM per_vac
      GROUP BY bucket
    `);

    const byKind = await this.db.execute<{
      kind: string;
      links: string;
      verified: string;
    }>(sql`
      SELECT
        CASE WHEN vn.is_required THEN 'required' ELSE 'optional' END AS kind,
        COUNT(*)::text AS links,
        COUNT(*) FILTER (WHERE n.status = 'VERIFIED')::text AS verified
      FROM vacancy_nodes vn JOIN nodes n ON n.id = vn.node_id
      GROUP BY vn.is_required
    `);

    const bySource = await this.db.execute<{
      code: string;
      vacancies: string;
      links: string;
      verified: string;
    }>(sql`
      SELECT s.code,
             COUNT(DISTINCT v.id)::text AS vacancies,
             COUNT(*)::text AS links,
             COUNT(*) FILTER (WHERE n.status = 'VERIFIED')::text AS verified
      FROM vacancies v
      JOIN sources s ON s.id = v.source_id
      JOIN vacancy_nodes vn ON vn.vacancy_id = v.id
      JOIN nodes n ON n.id = vn.node_id
      GROUP BY s.code
      ORDER BY s.code
    `);

    return {
      byAxis: Object.fromEntries(
        byAxis.rows.map((r) => [
          r.axis,
          {
            verified: Number(r.verified),
            new: Number(r.new_status),
            missing: Number(r.missing),
            total: Number(r.total),
          },
        ]),
      ),
      fullyVerified: {
        total: Number(fully.rows[0].total),
        fullyVerified: Number(fully.rows[0].fully),
      },
      skillBuckets: buckets.rows.map((r) => ({
        bucket: r.bucket,
        vacancies: Number(r.vacancies),
        avgSkillCount: Number(r.avg_skill_count),
      })),
      byKind: Object.fromEntries(
        byKind.rows.map((r) => [
          r.kind,
          {
            links: Number(r.links),
            verified: Number(r.verified),
            pct: pct(Number(r.verified), Number(r.links)),
          },
        ]),
      ),
      bySource: bySource.rows.map((r) => ({
        code: r.code,
        vacancies: Number(r.vacancies),
        links: Number(r.links),
        verified: Number(r.verified),
        pct: pct(Number(r.verified), Number(r.links)),
      })),
    };
  }

  // Unified moderation list. Per-node `vacanciesBlocked` is the number of
  // vacancies referencing this node: SKILL via vacancy_nodes, ROLE/DOMAIN
  // via the column on vacancies. Result is the same shape across types so
  // the UI can render them interleaved when no type filter is applied.
  async listNodes(filters: NodeListFilters): Promise<NodeListResult> {
    const offset = (filters.page - 1) * filters.pageSize;
    const trimmedQ = filters.q?.trim() ?? "";
    const like =
      trimmedQ.length > 0
        ? `%${trimmedQ.replace(/[\\%_]/g, "\\$&")}%`
        : null;

    // Drizzle binds `${array}` as a row literal `($1, $2, $3)` — Postgres
    // can't cast that to `text[]`. `sql.join` keeps each value as its own
    // bind so we get a regular comma-separated parameter list for `IN`.
    const statusList = sql.join(
      filters.statuses.map((s) => sql`${s}`),
      sql`, `,
    );
    // Optional clauses are composed conditionally rather than via
    // `(NULL OR ...)` short-circuits — that pattern needs explicit casts
    // for the bound NULLs, which is more friction than just not emitting
    // the clause at all.
    const typeClause = filters.type
      ? sql`AND n.type = ${filters.type}`
      : sql``;
    const searchClause = like
      ? sql`AND (
          n.canonical_name ILIKE ${like}
          OR EXISTS (
            SELECT 1 FROM node_aliases na
            WHERE na.node_id = n.id AND na.name ILIKE ${like}
          )
        )`
      : sql``;

    // ORDER BY columns are qualified with the `filtered` CTE name so they
    // resolve to the underlying bigint, not the same-named text column we
    // project in the SELECT — Postgres prefers output names and would sort
    // lexicographically (11 before 9) otherwise.
    const rows = await this.db.execute<{
      id: string;
      type: NodeTypeValue;
      canonical_name: string;
      status: NodeStatusValue;
      vacancies_blocked: string;
      alias_count: string;
      total: string;
    }>(sql`
      WITH skill_blocked AS (
        SELECT vn.node_id, COUNT(DISTINCT vn.vacancy_id) AS blocked
        FROM vacancy_nodes vn
        GROUP BY vn.node_id
      ),
      role_blocked AS (
        SELECT role_node_id AS node_id, COUNT(*) AS blocked
        FROM vacancies WHERE role_node_id IS NOT NULL
        GROUP BY role_node_id
      ),
      domain_blocked AS (
        SELECT domain_node_id AS node_id, COUNT(*) AS blocked
        FROM vacancies WHERE domain_node_id IS NOT NULL
        GROUP BY domain_node_id
      ),
      alias_counts AS (
        SELECT node_id, COUNT(*) AS c FROM node_aliases GROUP BY node_id
      ),
      nodes_enriched AS (
        SELECT n.id,
               n.type::text AS type,
               n.canonical_name,
               n.status::text AS status,
               COALESCE(
                 CASE n.type
                   WHEN 'SKILL'  THEN sb.blocked
                   WHEN 'ROLE'   THEN rb.blocked
                   WHEN 'DOMAIN' THEN db.blocked
                 END, 0
               ) AS vacancies_blocked,
               COALESCE(a.c, 0) AS alias_count
        FROM nodes n
        LEFT JOIN skill_blocked  sb ON sb.node_id = n.id
        LEFT JOIN role_blocked   rb ON rb.node_id = n.id
        LEFT JOIN domain_blocked db ON db.node_id = n.id
        LEFT JOIN alias_counts   a  ON a.node_id  = n.id
      ),
      filtered AS (
        SELECT * FROM nodes_enriched n
        WHERE n.status IN (${statusList})
          AND n.vacancies_blocked >= ${filters.minBlocked}
          ${typeClause}
          ${searchClause}
      )
      SELECT id, type, canonical_name, status,
             vacancies_blocked::text,
             alias_count::text,
             (COUNT(*) OVER ())::text AS total
      FROM filtered
      ORDER BY filtered.vacancies_blocked DESC, filtered.canonical_name ASC
      LIMIT ${filters.pageSize} OFFSET ${offset}
    `);

    const total = rows.rows.length > 0 ? Number(rows.rows[0].total) : 0;
    return {
      page: filters.page,
      pageSize: filters.pageSize,
      total,
      items: rows.rows.map((r) => ({
        id: r.id,
        type: r.type,
        canonicalName: r.canonical_name,
        status: r.status,
        vacanciesBlocked: Number(r.vacancies_blocked),
        aliasCount: Number(r.alias_count),
      })),
    };
  }

  async getNodeDetail(id: string) {
    const [node] = await this.db
      .select()
      .from(schema.nodes)
      .where(eq(schema.nodes.id, id));
    if (!node) throw new NotFoundException(`Node ${id} not found`);

    const aliases = await this.db
      .select({
        name: schema.nodeAliases.name,
        createdAt: schema.nodeAliases.createdAt,
      })
      .from(schema.nodeAliases)
      .where(eq(schema.nodeAliases.nodeId, id));

    const vacancyCount = await countVacanciesForNode(this.db, id, node.type);
    const sample = await sampleVacanciesForNode(this.db, id, node.type, 5);

    return {
      id: node.id,
      canonicalName: node.canonicalName,
      type: node.type,
      status: node.status,
      createdAt: node.createdAt,
      aliases: aliases.map((a) => ({ name: a.name, createdAt: a.createdAt })),
      vacancyCount,
      sampleVacancies: sample,
    };
  }

  // Trigram-based fuzzy candidates within the same type. Applies a
  // length floor on both sides + a per-type similarity threshold so
  // short tokens like "C" don't false-match "C++"/"C#" at sim=1.
  async getFuzzyMatches(id: string) {
    const [node] = await this.db
      .select()
      .from(schema.nodes)
      .where(eq(schema.nodes.id, id));
    if (!node) throw new NotFoundException(`Node ${id} not found`);

    const cfg = FUZZY[node.type as NodeTypeValue];
    const name = node.canonicalName;
    if (name.length < cfg.minLen) {
      return {
        node: trimNode(node),
        matches: [],
        skippedReason: `canonicalName length ${name.length} < min ${cfg.minLen} for ${node.type}`,
      };
    }

    const wordSimClause = cfg.minWordSim
      ? sql`AND word_similarity(LOWER(${name}), LOWER(canonical_name)) >= ${cfg.minWordSim}`
      : sql``;

    const rows = await this.db.execute<{
      id: string;
      canonical_name: string;
      status: string;
      similarity: string;
      word_similarity: string;
    }>(sql`
      SELECT id,
             canonical_name,
             status::text AS status,
             similarity(LOWER(${name}), LOWER(canonical_name))::text AS similarity,
             word_similarity(LOWER(${name}), LOWER(canonical_name))::text AS word_similarity
      FROM nodes
      WHERE type = ${node.type}
        AND id <> ${id}
        AND status = 'VERIFIED'
        AND LENGTH(canonical_name) >= ${cfg.minLen}
        AND similarity(LOWER(${name}), LOWER(canonical_name)) >= ${cfg.minSim}
        ${wordSimClause}
      ORDER BY similarity(LOWER(${name}), LOWER(canonical_name)) DESC
      LIMIT 20
    `);

    return {
      node: trimNode(node),
      matches: rows.rows.map((r) => ({
        id: r.id,
        canonicalName: r.canonical_name,
        status: r.status,
        similarity: Number(Number(r.similarity).toFixed(3)),
        wordSimilarity: Number(Number(r.word_similarity).toFixed(3)),
      })),
    };
  }

  // Free-text search across VERIFIED nodes of a given type. Used by the
  // detail panel to find a merge target when fuzzy didn't surface it
  // (short names, novel phrasing). ILIKE finds substring hits even when
  // trigram similarity is below the fuzzy threshold; trigram only ranks.
  async searchVerifiedNodes(type: NodeTypeValue, q: string, limit: number) {
    const trimmed = q.trim();
    const like = `%${trimmed.replace(/[\\%_]/g, "\\$&")}%`;
    const rows = await this.db.execute<{
      id: string;
      canonical_name: string;
      status: string;
      similarity: string;
    }>(sql`
      SELECT n.id,
             n.canonical_name,
             n.status::text AS status,
             similarity(LOWER(${trimmed}), LOWER(n.canonical_name))::text AS similarity
      FROM nodes n
      WHERE n.type = ${type}
        AND n.status = 'VERIFIED'
        AND (
          n.canonical_name ILIKE ${like}
          OR EXISTS (
            SELECT 1 FROM node_aliases a
            WHERE a.node_id = n.id
              AND a.type = ${type}
              AND a.name ILIKE ${like}
          )
        )
      ORDER BY similarity(LOWER(${trimmed}), LOWER(n.canonical_name)) DESC,
               n.canonical_name ASC
      LIMIT ${limit}
    `);

    return {
      type,
      query: trimmed,
      matches: rows.rows.map((r) => ({
        id: r.id,
        canonicalName: r.canonical_name,
        status: r.status as "VERIFIED",
        similarity: Number(Number(r.similarity).toFixed(3)),
        wordSimilarity: 0,
      })),
    };
  }

  async setStatus(id: string, status: "VERIFIED" | "HIDDEN") {
    const [updated] = await this.db
      .update(schema.nodes)
      .set({ status })
      .where(eq(schema.nodes.id, id))
      .returning();
    if (!updated) throw new NotFoundException(`Node ${id} not found`);
    return trimNode(updated);
  }

  // Promote NEW skills that have proven themselves by usage: linked from
  // enough distinct vacancies AND seen at more than one company, so a single
  // employer's jargon can't self-verify. Vacancies without a company count as
  // their own "company" — a third of the corpus has company_id NULL, and a
  // strict company check would silently exclude skills seen only there.
  // HIDDEN is never touched: an operator's "this is junk" verdict is final.
  // Idempotent — safe for the Temporal schedule to re-fire.
  async autoVerifySkills(): Promise<{ promoted: string[] }> {
    const result = await this.db.execute<{ canonical_name: string }>(sql`
      UPDATE nodes SET status = 'VERIFIED'
      WHERE type = 'SKILL' AND status = 'NEW'
        AND id IN (
          SELECT vn.node_id
          FROM vacancy_nodes vn
          JOIN vacancies v ON v.id = vn.vacancy_id
          GROUP BY vn.node_id
          HAVING count(DISTINCT vn.vacancy_id) >= ${AUTOVERIFY_MIN_VACANCIES}
             AND count(DISTINCT coalesce(v.company_id::text, v.id::text))
                 >= ${AUTOVERIFY_MIN_COMPANIES}
        )
      RETURNING canonical_name
    `);
    return { promoted: result.rows.map((r) => r.canonical_name) };
  }

  // Rename a node's canonical name. The old canonical becomes an alias so
  // historical extractions still resolve. Conflicts surface as 409 with a
  // mergeTargetId suggestion — the UI uses it to route the operator into
  // the merge flow instead of dead-ending them with an error.
  async renameNode(id: string, rawName: string) {
    const newName = rawName.trim();
    if (newName.length < RENAME_MIN_LEN) {
      throw new BadRequestException(
        `name must be at least ${RENAME_MIN_LEN} characters`,
      );
    }

    return this.db.transaction(async (tx) => {
      const [node] = await tx
        .select()
        .from(schema.nodes)
        .where(eq(schema.nodes.id, id));
      if (!node) throw new NotFoundException(`Node ${id} not found`);

      if (newName === node.canonicalName) {
        throw new BadRequestException("name is the same as current canonical");
      }

      const conflicts = await tx.execute<{ id: string; source: string }>(sql`
        SELECT id, 'canonical'::text AS source
        FROM nodes
        WHERE type = ${node.type}
          AND id <> ${id}
          AND LOWER(canonical_name) = LOWER(${newName})
        UNION ALL
        SELECT node_id AS id, 'alias'::text AS source
        FROM node_aliases
        WHERE type = ${node.type}
          AND node_id <> ${id}
          AND name = ${normalizeAliasName(newName)}
        LIMIT 1
      `);

      if (conflicts.rows.length > 0) {
        const c = conflicts.rows[0];
        throw new ConflictException({
          message: `name "${newName}" already exists as ${c.source} of another ${node.type} node`,
          suggestion: { mergeTargetId: c.id },
        });
      }

      // Both the old and the new canonical live on as normalized aliases so
      // historical extractions (in any case/spelling) keep resolving here.
      // Storing normalize(canonical) as a self-alias is the same invariant
      // ingest maintains — it's what stops a differently-spelled
      // re-extraction from spawning a duplicate node. ON CONFLICT (incl.
      // intra-VALUES dupes on a case-only rename) is a safe no-op via
      // DO NOTHING.
      await tx.execute(sql`
        INSERT INTO node_aliases (name, type, node_id)
        VALUES
          (${normalizeAliasName(node.canonicalName)}, ${node.type}, ${id}),
          (${normalizeAliasName(newName)}, ${node.type}, ${id})
        ON CONFLICT (name, type) DO NOTHING
      `);

      const [updated] = await tx
        .update(schema.nodes)
        .set({ canonicalName: newName })
        .where(eq(schema.nodes.id, id))
        .returning();
      return trimNode(updated);
    });
  }

  // Merge sourceId into targetId: keep target as canonical, fold the source's
  // name + aliases into target's alias list, repoint all vacancy references,
  // delete source. One transaction so partial state is impossible.
  async mergeInto(sourceId: string, targetId: string) {
    if (sourceId === targetId) {
      throw new BadRequestException("source and target must differ");
    }

    return this.db.transaction(async (tx) => {
      const both = await tx
        .select()
        .from(schema.nodes)
        .where(inArray(schema.nodes.id, [sourceId, targetId]));
      const source = both.find((n) => n.id === sourceId);
      const target = both.find((n) => n.id === targetId);
      if (!source) throw new NotFoundException(`Source node ${sourceId} not found`);
      if (!target) throw new NotFoundException(`Target node ${targetId} not found`);
      if (source.type !== target.type) {
        throw new BadRequestException(
          `cannot merge across types: ${source.type} → ${target.type}`,
        );
      }
      if (source.status === "NEW" && target.status !== "VERIFIED") {
        throw new BadRequestException(
          `NEW node can only be merged into a VERIFIED target; target status is ${target.status}`,
        );
      }

      // 1) Move source's existing aliases to target (skip duplicates by unique key).
      await tx.execute(sql`
        UPDATE node_aliases
        SET node_id = ${targetId}
        WHERE node_id = ${sourceId}
          AND NOT EXISTS (
            SELECT 1 FROM node_aliases a2
            WHERE a2.type = node_aliases.type AND a2.name = node_aliases.name
              AND a2.node_id = ${targetId}
          )
      `);

      // 2) Source's canonical name becomes an alias of target (if not already one).
      // Normalized: ingest resolves aliases by exact normalized match, so a
      // raw-form alias here would silently never resolve (and spawn dup nodes).
      await tx.execute(sql`
        INSERT INTO node_aliases (name, type, node_id)
        VALUES (${normalizeAliasName(source.canonicalName)}, ${source.type}, ${targetId})
        ON CONFLICT (name, type) DO NOTHING
      `);

      // 3) Re-point vacancy_nodes (composite PK collision: drop dupes first).
      await tx.execute(sql`
        DELETE FROM vacancy_nodes
        WHERE node_id = ${sourceId}
          AND vacancy_id IN (
            SELECT vacancy_id FROM vacancy_nodes WHERE node_id = ${targetId}
          )
      `);
      await tx
        .update(schema.vacancyNodes)
        .set({ nodeId: targetId })
        .where(eq(schema.vacancyNodes.nodeId, sourceId));

      // 4) Re-point vacancies.role_node_id / domain_node_id.
      await tx
        .update(schema.vacancies)
        .set({ roleNodeId: targetId })
        .where(eq(schema.vacancies.roleNodeId, sourceId));
      await tx
        .update(schema.vacancies)
        .set({ domainNodeId: targetId })
        .where(eq(schema.vacancies.domainNodeId, sourceId));

      // 4b) Re-point candidate_nodes (CV skill links). Same composite-PK
      // collision handling as vacancy_nodes — drop dupes first, then move the
      // rest. Without this the final node delete trips the candidate_nodes FK
      // (ON DELETE NO ACTION) and aborts the whole merge for any skill a CV has
      // matched. Harmless no-op for ROLE/DOMAIN merges (those never link here).
      await tx.execute(sql`
        DELETE FROM candidate_nodes
        WHERE node_id = ${sourceId}
          AND candidate_id IN (
            SELECT candidate_id FROM candidate_nodes WHERE node_id = ${targetId}
          )
      `);
      await tx
        .update(schema.candidateNodes)
        .set({ nodeId: targetId })
        .where(eq(schema.candidateNodes.nodeId, sourceId));

      // 5) Delete source. Any lingering aliases cascade automatically.
      await tx
        .delete(schema.nodeAliases)
        .where(
          and(
            eq(schema.nodeAliases.nodeId, sourceId),
          ),
        );
      await tx.delete(schema.nodes).where(eq(schema.nodes.id, sourceId));

      return { mergedInto: targetId, source: source.canonicalName, target: target.canonicalName };
    });
  }
}

function pct(num: number, denom: number): number {
  if (denom === 0) return 0;
  return Number(((num / denom) * 100).toFixed(1));
}

function trimNode(n: {
  id: string;
  canonicalName: string;
  type: string;
  status: string;
}) {
  return {
    id: n.id,
    canonicalName: n.canonicalName,
    type: n.type,
    status: n.status,
  };
}

async function countVacanciesForNode(
  db: DrizzleDB,
  nodeId: string,
  type: string,
): Promise<number> {
  if (type === "SKILL") {
    const r = await db.execute<{ c: string }>(sql`
      SELECT COUNT(DISTINCT vacancy_id)::text AS c
      FROM vacancy_nodes WHERE node_id = ${nodeId}
    `);
    return Number(r.rows[0]?.c ?? 0);
  }
  const column = type === "ROLE" ? sql`role_node_id` : sql`domain_node_id`;
  const r = await db.execute<{ c: string }>(sql`
    SELECT COUNT(*)::text AS c FROM vacancies WHERE ${column} = ${nodeId}
  `);
  return Number(r.rows[0]?.c ?? 0);
}

async function sampleVacanciesForNode(
  db: DrizzleDB,
  nodeId: string,
  type: string,
  limit: number,
): Promise<{ id: string; title: string; sourceCode: string }[]> {
  if (type === "SKILL") {
    const r = await db.execute<{
      id: string;
      title: string;
      source_code: string;
    }>(sql`
      SELECT v.id, v.title, s.code AS source_code
      FROM vacancy_nodes vn
      JOIN vacancies v ON v.id = vn.vacancy_id
      JOIN sources s ON s.id = v.source_id
      WHERE vn.node_id = ${nodeId}
      ORDER BY v.loaded_at DESC
      LIMIT ${limit}
    `);
    return r.rows.map((row) => ({
      id: row.id,
      title: row.title,
      sourceCode: row.source_code,
    }));
  }
  const column = type === "ROLE" ? sql`role_node_id` : sql`domain_node_id`;
  const r = await db.execute<{
    id: string;
    title: string;
    source_code: string;
  }>(sql`
    SELECT v.id, v.title, s.code AS source_code
    FROM vacancies v JOIN sources s ON s.id = v.source_id
    WHERE v.${column} = ${nodeId}
    ORDER BY v.loaded_at DESC
    LIMIT ${limit}
  `);
  return r.rows.map((row) => ({
    id: row.id,
    title: row.title,
    sourceCode: row.source_code,
  }));
}
