import { Inject, Injectable } from "@nestjs/common";

import { sql } from "drizzle-orm";

import { DRIZZLE } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import type { SkillSuggestion } from "./cv.contract";

// Only real associations, not coincidence: NPMI in [-1,1]; a positive floor also
// drops substitutes (React/Angular co-occur weakly) and negatively-linked pairs.
const NPMI_FLOOR = 0.1;
const MAX_SUGGESTIONS = 12;

// "You probably also know X" — data-driven from node_skill_cooc. For each skill
// the candidate listed, gather the skills that co-occur with it in the vacancy
// corpus, then rank a suggestion by the SUM of its NPMI links across ALL the
// candidate's skills (breadth x strength). Summing — not a single conditional
// P(b|held) — is deliberate: P inflates for rare held skills (a low-df skill like
// FFmpeg makes P(C++|FFmpeg) huge off one vacancy), which lets one niche skill
// hijack the list; summing rewards skills that many of your skills point to.
// Excludes ones already held and generic-everywhere noise (Docker, CI/CD, Git).
// Confirm-gated in the UI, so this leans toward recall — a wrong chip is free to
// ignore; the cost is missing a real skill (a Mongo dev who skipped listing it).
@Injectable()
export class AdditionalSkillsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async suggest(candidateId: string): Promise<SkillSuggestion[]> {
    const rows = await this.db.execute<{
      node_id: string;
      name: string;
      implied_by: string;
    }>(sql`
      WITH held AS (
        SELECT node_id FROM candidate_nodes WHERE candidate_id = ${candidateId}::uuid
      ),
      rejected AS (
        SELECT value::uuid AS node_id
        FROM candidates c,
             jsonb_array_elements_text(COALESCE(c.extracted->'rejectedSkillIds', '[]'::jsonb)) AS value
        WHERE c.id = ${candidateId}::uuid
      ),
      links AS (
        SELECT xc.b_id AS node_id, nb.canonical_name AS name,
               ha.canonical_name AS implied_by, xc.npmi
        FROM held h
        JOIN nodes ha ON ha.id = h.node_id
        JOIN node_skill_cooc xc ON xc.a_id = h.node_id
        JOIN nodes nb ON nb.id = xc.b_id AND nb.status = 'VERIFIED' AND nb.type = 'SKILL'
        LEFT JOIN node_tech_meta m ON m.node_id = xc.b_id
        WHERE xc.npmi >= ${NPMI_FLOOR}
          AND COALESCE(m.generic, false) = false
          AND xc.b_id NOT IN (SELECT node_id FROM held)
          AND xc.b_id NOT IN (SELECT node_id FROM rejected)
      ),
      agg AS (
        SELECT node_id, name, sum(npmi) AS score FROM links GROUP BY node_id, name
      ),
      reason AS (
        -- the strongest single link per suggestion, for the "why" tooltip
        SELECT DISTINCT ON (node_id) node_id, implied_by FROM links ORDER BY node_id, npmi DESC
      )
      SELECT a.node_id::text AS node_id, a.name, r.implied_by
      FROM agg a JOIN reason r USING (node_id)
      ORDER BY a.score DESC LIMIT ${MAX_SUGGESTIONS}
    `);

    return rows.rows.map((r) => ({
      nodeId: r.node_id,
      name: r.name,
      impliedBy: r.implied_by,
    }));
  }
}
