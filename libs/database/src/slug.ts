// Slug minting for taxonomy nodes. Shared by the ingest insert path (apps/etl)
// and the backfill seed so both mint the SAME way. Slugs are minted once and
// immutable on rename, so URLs stay stable (mirrors tracks.slug).

export function slugify(input: string): string {
  return (
    input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'n'
  );
}

// First free slug of the form `base`, `base-2`, `base-3`… given the slugs
// already taken for this node type. Distinct canonical names can slugify to the
// same base (C, C++, C# -> "c"), so the `(type, slug)` unique constraint needs
// a deterministic suffix.
export function uniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}
