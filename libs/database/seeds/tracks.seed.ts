import { eq, and, notInArray } from 'drizzle-orm';
import type { DrizzleDB } from '../src/tokens';
import { tracks, trackNodes, nodes } from '../src/schema';

type NodeTypeValue = 'ROLE' | 'SKILL' | 'DOMAIN';
type NodeRef = { type: NodeTypeValue; canonicalName: string };

export type TrackSeed = {
  slug: string;
  label: string;
  parentSlug?: string;
  sortOrder: number;
  nodes: NodeRef[];
};

// Idempotent: re-runnable, relinks parents and re-syncs node membership.
// A node ref that does not resolve fails loudly — that is a curation error
// (the canonicalName must match an existing nodes.canonical_name exactly).
export async function seedTracks(
  db: DrizzleDB,
  data: TrackSeed[],
): Promise<void> {
  // Pass 0 — prune tracks no longer in the seed so the JSON is the full source
  // of truth (track_nodes cascade on delete). Children go before parents would
  // matter for ON DELETE, but parent_id is ON DELETE no-action, so delete leaves
  // first; doing it in one statement is fine because we only ever drop whole
  // subtrees together here. Empty seed is treated as a no-op guard.
  const keepSlugs = data.map((t) => t.slug);
  if (keepSlugs.length > 0) {
    await db.delete(tracks).where(notInArray(tracks.slug, keepSlugs));
  }

  // Pass 1 — upsert every track row first, so parent links in pass 2 resolve
  // regardless of declaration order.
  const idBySlug = new Map<string, string>();
  for (const t of data) {
    const [{ id }] = await db
      .insert(tracks)
      .values({ slug: t.slug, label: t.label, sortOrder: t.sortOrder })
      .onConflictDoUpdate({
        target: tracks.slug,
        set: { label: t.label, sortOrder: t.sortOrder },
      })
      .returning({ id: tracks.id });
    idBySlug.set(t.slug, id);
  }

  // Pass 2 — resolve parent links and re-sync membership.
  for (const t of data) {
    const trackId = idBySlug.get(t.slug)!;

    let parentId: string | null = null;
    if (t.parentSlug) {
      parentId = idBySlug.get(t.parentSlug) ?? null;
      if (!parentId) {
        throw new Error(
          `Track "${t.slug}" references unknown parent "${t.parentSlug}"`,
        );
      }
    }
    await db.update(tracks).set({ parentId }).where(eq(tracks.id, trackId));

    // Re-sync from scratch so removing a node ref in the JSON actually unlinks.
    await db.delete(trackNodes).where(eq(trackNodes.trackId, trackId));
    for (const ref of t.nodes) {
      const [node] = await db
        .select({ id: nodes.id })
        .from(nodes)
        .where(
          and(
            eq(nodes.type, ref.type),
            eq(nodes.canonicalName, ref.canonicalName),
          ),
        )
        .limit(1);
      if (!node) {
        throw new Error(
          `Track "${t.slug}" references missing ${ref.type} node "${ref.canonicalName}"`,
        );
      }
      await db
        .insert(trackNodes)
        .values({ trackId, nodeId: node.id })
        .onConflictDoNothing();
    }
  }
}
