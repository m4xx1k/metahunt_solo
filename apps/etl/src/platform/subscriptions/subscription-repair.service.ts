import { Injectable } from "@nestjs/common";

import { sql } from "drizzle-orm";

import type { DrizzleExecutor } from "@metahunt/database";

export type SubscriptionRepairSummary = {
  inspected: number;
  rewritten: number;
  /** Human-readable notes: an arm lost an id with no surviving successor. */
  narrowed: string[];
  /** Active subscription ids left untouched because fixing them would empty
   *  a match arm (roleIds/skillIds) that had one — reported for a human. */
  wouldSilence: string[];
};

const sameIds = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

// Re-points subscriptions.params after a node merge: merged-node uuids follow
// their target, uuids with no surviving VERIFIED node are dropped. `params` is
// JSONB with no FK, so nothing else in the system would ever notice a dead
// uuid — the filter arm (or the excluded-skill arm) just silently stops
// matching. One call site for both the map/admin merge (inside its
// transaction) and the CLI plan-apply path (after the batch commits) — see
// md/journal/migrations/taxonomy-implication-graph.md Phase A.
@Injectable()
export class SubscriptionRepairService {
  // `remap` is `{ sourceId -> targetId }` for the merge(s) just applied.
  // `executor` is either an open transaction or the plain db handle — both
  // satisfy `DrizzleExecutor`, so the same call works from `mergeInto`
  // (still inside its transaction) and from the CLI (after the batch commits).
  async repointMergedNodes(
    executor: DrizzleExecutor,
    remap: Map<string, string>,
  ): Promise<SubscriptionRepairSummary> {
    // No `remap.size === 0` shortcut: even an empty map still drops arms
    // pointing at nodes that are gone or no longer VERIFIED for any other
    // reason (a hide, a merge from an earlier run) — that catch is the whole
    // reason the CLI calls this with every subscription, not just the ones
    // touched by this run's merges.
    const { rows: live } = await executor.execute<{ id: string }>(sql`
      SELECT id::text FROM nodes WHERE status = 'VERIFIED'
    `);
    const verified = new Set(live.map((r) => r.id));

    const { rows: subs } = await executor.execute<{
      id: string;
      is_active: boolean;
      role_ids: string[] | null;
      skill_ids: string[] | null;
      excluded_skill_ids: string[] | null;
    }>(sql`
      SELECT id::text, is_active,
             CASE WHEN params ? 'roleIds'
                  THEN ARRAY(SELECT jsonb_array_elements_text(params->'roleIds')) END AS role_ids,
             CASE WHEN params ? 'skillIds'
                  THEN ARRAY(SELECT jsonb_array_elements_text(params->'skillIds')) END AS skill_ids,
             CASE WHEN params ? 'excludedSkillIds'
                  THEN ARRAY(SELECT jsonb_array_elements_text(params->'excludedSkillIds')) END AS excluded_skill_ids
      FROM subscriptions
    `);

    const fix = (ids: string[] | null): string[] | null => {
      if (!ids) return null;
      const out: string[] = [];
      for (const id of ids) {
        const mapped = remap.get(id) ?? id;
        if (verified.has(mapped) && !out.includes(mapped)) out.push(mapped);
      }
      return out;
    };

    let rewritten = 0;
    const narrowed: string[] = [];
    const wouldSilence: string[] = [];

    for (const s of subs) {
      const roles = fix(s.role_ids);
      const skills = fix(s.skill_ids);
      const excluded = fix(s.excluded_skill_ids);
      const roleChanged = roles !== null && !sameIds(roles, s.role_ids ?? []);
      const skillChanged = skills !== null && !sameIds(skills, s.skill_ids ?? []);
      const excludedChanged = excluded !== null && !sameIds(excluded, s.excluded_skill_ids ?? []);
      if (!roleChanged && !skillChanged && !excludedChanged) continue;

      // Refuse to empty a match arm that had ids: that silences a live user
      // with no trace, so leave it for a human instead. Emptying the
      // excluded-skill arm is not silencing — it only stops hiding
      // something — so it's fixed straight through like everything else,
      // never refused.
      const emptiesRoles = roles !== null && roles.length === 0 && (s.role_ids?.length ?? 0) > 0;
      const emptiesSkills =
        skills !== null && skills.length === 0 && (s.skill_ids?.length ?? 0) > 0;
      if (s.is_active && (emptiesRoles || emptiesSkills)) {
        wouldSilence.push(s.id);
        continue;
      }

      await executor.execute(sql`
        UPDATE subscriptions SET params = params
          ${roles === null ? sql`` : sql`|| jsonb_build_object('roleIds', ${JSON.stringify(roles)}::jsonb)`}
          ${skills === null ? sql`` : sql`|| jsonb_build_object('skillIds', ${JSON.stringify(skills)}::jsonb)`}
          ${excluded === null ? sql`` : sql`|| jsonb_build_object('excludedSkillIds', ${JSON.stringify(excluded)}::jsonb)`}
        WHERE id = ${s.id}::uuid
      `);
      rewritten += 1;

      const lostRoles = (s.role_ids?.length ?? 0) - (roles?.length ?? 0);
      const lostExcluded = (s.excluded_skill_ids?.length ?? 0) - (excluded?.length ?? 0);
      if (s.is_active && lostRoles > 0) narrowed.push(`${s.id} (-${lostRoles} role arm(s))`);
      if (lostExcluded > 0) {
        narrowed.push(`${s.id} (-${lostExcluded} excluded-skill arm(s) — was hiding, now visible)`);
      }
    }

    return { inspected: subs.length, rewritten, narrowed, wouldSilence };
  }
}
