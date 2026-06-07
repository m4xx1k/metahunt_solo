import { sql, type SQL } from "drizzle-orm";

// Comma-join ids as a uuid-cast SQL list for an `IN (...)` clause:
//   IN (${uuidList(ids)})  →  IN ('a'::uuid, 'b'::uuid)
// One home for the id-list pattern that otherwise gets re-inlined per query.
export function uuidList(ids: string[]): SQL {
  return sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
}
