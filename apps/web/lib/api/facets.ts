// Full verified ROLE / SKILL catalogs for the filter sidebar's search.
// The market snapshot only ships a topN (for the headline widgets);
// search/add needs the whole list. Source of truth:
// apps/etl/src/feed/feed.contract.ts. Hand-mirrored per ADR-0005.

import { apiGet } from "./client";

export interface NodeFacet {
  id: string;
  name: string;
  count: number;
}

export interface RoleFacetsResponse {
  roles: NodeFacet[];
}

export interface SkillFacetsResponse {
  skills: NodeFacet[];
}

// ISR-cache the catalogs: they only change on the hourly RSS ingest, but the
// filter sidebar re-fetches them on every role/skill toggle (a URL change
// re-runs the server page). Without this they hit the backend each toggle.
const ISR = { next: { revalidate: 60 } } satisfies RequestInit;

export const facetsApi = {
  roles: () => apiGet<RoleFacetsResponse>("/feed/roles", ISR),
  skills: () => apiGet<SkillFacetsResponse>("/feed/skills", ISR),
};
