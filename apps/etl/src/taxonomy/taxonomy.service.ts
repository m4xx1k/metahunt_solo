import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { sql, eq } from "drizzle-orm";
import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

export type NodeTypeValue = "ROLE" | "SKILL" | "DOMAIN";

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

  // Moderation queue: NEW nodes ranked by how many vacancies they "block"
  // from being fully VERIFIED. SKILL counts via vacancy_nodes; ROLE/DOMAIN
  // count via the column on vacancies. When type is omitted, returns all
  // three types interleaved by impact.
  async getQueue(type: NodeTypeValue | undefined, limit: number) {
    const rows = await this.db.execute<{
      id: string;
      type: string;
      canonical_name: string;
      vacancies_blocked: string;
    }>(sql`
      WITH skill_counts AS (
        SELECT n.id, n.type::text AS type, n.canonical_name,
               COUNT(DISTINCT vn.vacancy_id) AS vacancies_blocked
        FROM nodes n JOIN vacancy_nodes vn ON vn.node_id = n.id
        WHERE n.status = 'NEW' AND n.type = 'SKILL'
        GROUP BY n.id
      ),
      role_counts AS (
        SELECT n.id, n.type::text AS type, n.canonical_name,
               COUNT(DISTINCT v.id) AS vacancies_blocked
        FROM nodes n JOIN vacancies v ON v.role_node_id = n.id
        WHERE n.status = 'NEW' AND n.type = 'ROLE'
        GROUP BY n.id
      ),
      domain_counts AS (
        SELECT n.id, n.type::text AS type, n.canonical_name,
               COUNT(DISTINCT v.id) AS vacancies_blocked
        FROM nodes n JOIN vacancies v ON v.domain_node_id = n.id
        WHERE n.status = 'NEW' AND n.type = 'DOMAIN'
        GROUP BY n.id
      ),
      all_counts AS (
        SELECT * FROM skill_counts
        UNION ALL SELECT * FROM role_counts
        UNION ALL SELECT * FROM domain_counts
      )
      SELECT id, type, canonical_name, vacancies_blocked
      FROM all_counts
      WHERE ${type ? sql`type = ${type}` : sql`TRUE`}
      ORDER BY vacancies_blocked DESC, canonical_name ASC
      LIMIT ${limit}
    `);

    return {
      type: type ?? "ALL",
      items: rows.rows.map((r) => ({
        id: r.id,
        type: r.type,
        canonicalName: r.canonical_name,
        vacanciesBlocked: Number(r.vacancies_blocked),
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
