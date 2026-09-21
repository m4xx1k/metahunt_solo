import { sql, type SQL } from "drizzle-orm";

// A requirement unit is one thing a posting asks for. An ungrouped link is a
// unit of one; every member of one `requirement_group` ("Jenkins or GitLab CI")
// is a single unit, satisfied by any member.
//
// Three call sites collapse `position_nodes` rows by this key before they count
// anything — `scoringCtes` (coverage, relevance), `recommendation.service.ts`
// (the second coverage formula, R6) and the feed's excluded-skill predicate
// (R5). They share this expression so the three cannot drift, which they
// already had to be reconciled for once (MET-144).
//
// `requirement_group` numbers restart per posting, so the key is only unique
// inside one `position_id` — every aggregate over it groups by position too.
// The `'n'` prefix keeps a node's own key out of the group namespace.
export function requirementUnitKey(alias: string): SQL {
  return sql.raw(`COALESCE(${alias}.requirement_group::text, 'n' || ${alias}.node_id::text)`);
}
