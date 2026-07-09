import type { MeCv } from "@/lib/api/me";
import type { SavedCv } from "@/lib/hooks/use-saved";

// Merge the account's server CVs (cross-device source of truth once logged in)
// with this browser's local uploads. Deduped by candidateId: the local entry
// wins on a dup because it carries the freshest label/time from what the user
// just did on this device. Newest first.
export function mergeCvs(
  server: MeCv[] | undefined,
  local: SavedCv[],
): SavedCv[] {
  const byId = new Map<string, SavedCv>();
  for (const c of server ?? []) {
    byId.set(c.candidateId, {
      candidateId: c.candidateId,
      label: c.label,
      addedAt: new Date(c.createdAt).getTime(),
    });
  }
  for (const c of local) byId.set(c.candidateId, c);
  return [...byId.values()].sort((a, b) => b.addedAt - a.addedAt);
}
