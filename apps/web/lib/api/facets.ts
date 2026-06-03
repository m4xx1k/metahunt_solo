// Full verified ROLE / SKILL catalogs for the filter sidebar's search.
// The aggregates snapshot only ships a topN (for the headline widgets);
// search/add needs the whole list. Source of truth:
// apps/etl/src/vacancies/vacancies.contract.ts. Hand-mirrored per ADR-0005.

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

export const facetsApi = {
  roles: () => apiGet<RoleFacetsResponse>("/vacancies/roles"),
  skills: () => apiGet<SkillFacetsResponse>("/vacancies/skills"),
};
