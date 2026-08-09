import { sql } from "drizzle-orm";
import { uuid, boolean, pgView } from "drizzle-orm/pg-core";

// Position -> taxonomy links: the canonical posting's `vacancy_nodes`,
// reprojected onto `position_id`. Preserves every canonical link, required
// and optional alike — VERIFIED/type/required filters stay a consumer
// concern (different derived products deliberately use different eligibility
// layers), matching `position_nodes.is_required` 1:1 to the canonical
// posting's own links.
export const positionNodes = pgView("position_nodes", {
  positionId: uuid("position_id"),
  nodeId: uuid("node_id"),
  isRequired: boolean("is_required"),
}).as(
  sql`
    SELECT
      uv.id AS position_id,
      vn.node_id,
      vn.is_required
    FROM unique_vacancies uv
    JOIN vacancy_nodes vn ON vn.vacancy_id = uv.canonical_vacancy_id
  `,
);

export type PositionNode = typeof positionNodes.$inferSelect;
