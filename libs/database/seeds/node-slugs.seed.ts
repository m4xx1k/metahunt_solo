import { and, asc, eq, isNull } from 'drizzle-orm';

import type { DrizzleDB } from '../src/tokens';
import { nodes } from '../src/schema';
import { slugify, uniqueSlug } from '../src/slug';

// Backfill nodes.slug for rows minted before the column existed. Idempotent
// (only fills NULLs, never rewrites an existing slug -> slugs stay immutable)
// and per-type unique (seeds `taken` from already-minted slugs first). Run once
// after migrate; new nodes get their slug at ingest time.
export async function seedNodeSlugs(db: DrizzleDB): Promise<number> {
  const all = await db
    .select({
      id: nodes.id,
      type: nodes.type,
      canonicalName: nodes.canonicalName,
      slug: nodes.slug,
    })
    .from(nodes)
    .orderBy(asc(nodes.createdAt), asc(nodes.id));

  const takenByType = new Map<string, Set<string>>();
  for (const n of all) {
    if (!n.slug) continue;
    const set = takenByType.get(n.type) ?? new Set<string>();
    set.add(n.slug);
    takenByType.set(n.type, set);
  }

  let filled = 0;
  for (const n of all) {
    if (n.slug) continue;
    const taken = takenByType.get(n.type) ?? new Set<string>();
    const slug = uniqueSlug(slugify(n.canonicalName), taken);
    taken.add(slug);
    takenByType.set(n.type, taken);
    await db
      .update(nodes)
      .set({ slug })
      .where(and(eq(nodes.id, n.id), isNull(nodes.slug)));
    filled += 1;
  }
  return filled;
}
