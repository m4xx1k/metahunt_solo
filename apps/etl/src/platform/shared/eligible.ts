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

// Position analog of ELIGIBLE_VACANCY (MET-138): a position is publicly
// visible when its CANONICAL posting has a VERIFIED role. Raw predicate over
// the `p` alias (a `positions` row), shared by every Position-grain public
// aggregate. Kept out of the `positions` view itself — eligibility stays an
// explicit consumer rule, not a baked-in filter.
export const ELIGIBLE_POSITION = sql`
  p.role_node_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM nodes rn
    WHERE rn.id = p.role_node_id AND rn.status = 'VERIFIED'
  )
`;
