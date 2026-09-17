import type { MeCv } from "@/lib/api/me";
import type { SavedCv } from "@/lib/hooks/use-saved";

// A local entry that the server list does not know about can still be the CV
// uploaded seconds ago, before /me/cv refetched. Past this window it is stale —
// another account's, or one whose row is gone — and nothing can activate it.
const BRIDGE_MS = 2 * 60_000;

// Merge the account's server CVs (cross-device source of truth once logged in)
// with this browser's local uploads. Deduped by candidateId: the local entry
// wins on a dup because it carries the freshest label/time from what the user
// just did on this device. Newest first.
export function mergeCvs(
  server: MeCv[] | undefined,
  local: SavedCv[],
  now: number = Date.now(),
): SavedCv[] {
  const byId = new Map<string, SavedCv>();
  for (const c of server ?? []) {
    byId.set(c.candidateId, {
      candidateId: c.candidateId,
      label: c.label,
      addedAt: new Date(c.createdAt).getTime(),
    });
  }
  for (const c of local) {
    const unknownToServer = server !== undefined && !byId.has(c.candidateId);
    if (unknownToServer && now - c.addedAt > BRIDGE_MS) continue;
    byId.set(c.candidateId, c);
  }
  return [...byId.values()].sort((a, b) => b.addedAt - a.addedAt);
}
