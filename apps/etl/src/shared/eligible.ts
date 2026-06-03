import { sql } from "drizzle-orm";

// A vacancy is publicly visible for counts/facets when it has a VERIFIED role —
// taxonomy moderation directly gates what the market snapshot and filter
// sidebar surface. Raw predicate over the `v` alias, shared by the market
// aggregate and feed-facet queries.
export const ELIGIBLE_VACANCY = sql`
  v.role_node_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM nodes rn
    WHERE rn.id = v.role_node_id AND rn.status = 'VERIFIED'
  )
`;
