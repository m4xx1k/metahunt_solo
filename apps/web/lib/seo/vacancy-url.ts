// A bare UUID path carries no keyword and shows nothing useful in a SERP, so the
// canonical vacancy URL is `/vacancy/<role-slug>-<uuid>`. The UUID stays the last
// segment so the id is recoverable without a lookup table or a DB migration.

const UUID_TAIL = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** Slug source: the verified role, else the raw title. Deliberately NOT the title
 *  first — 35% of titles carry the board's "в <Company>, <City>, віддалено"
 *  suffix, which slugifies into noise. */
export function vacancySlugSource(v: { roleName?: string | null; title: string }): string {
  return v.roleName?.trim() || v.title;
}

export function slugifyForUrl(input: string): string {
  return (
    input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "vacancy"
  );
}

export function vacancyPath(v: { id: string; roleName?: string | null; title: string }): string {
  return `/vacancy/${slugifyForUrl(vacancySlugSource(v))}-${v.id}`;
}

/** Recovers the vacancy id from either URL form — the slugged one or a bare UUID
 *  (old links, and anything shared before this shipped). */
export function parseVacancyId(segment: string): string | null {
  return segment.match(UUID_TAIL)?.[1]?.toLowerCase() ?? null;
}
