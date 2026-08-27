/** Shape of pipeline/06-export-domain-axes.sql output (MET-143). Unlike
 *  src/types.ts, this is a SANDBOX contract — expect fields to move as the
 *  worthiness rubric grows past support into distinctiveness/overlap. */

export type DomainAxesContract = {
  status: string;
  grain: string;
  skillRequirementLayer: string;
  minDomainPositions: number;
  minDomainSkillSupport: number;
  minTrackSupport: number;
};

export type DomainAxesProvenance = {
  generatedAt: string;
  experiment: string;
  issue: string;
  positions: number;
  domainFillPct: number;
};

export type DomainRoleRow = { domain: string; domainPositions: number; role: string; positions: number };

export type DomainSkillRow = {
  domain: string;
  domainPositions: number;
  skill: string;
  support: number;
  pct: number;
};

export type TrackProfileRow = {
  slug: string;
  label: string;
  support: number;
  floorOk: boolean;
  topDomain: string | null;
  topSeniority: string | null;
  topWorkFormat: string | null;
};

export type DomainAxes = {
  contract: DomainAxesContract;
  provenance: DomainAxesProvenance;
  domainRole: DomainRoleRow[];
  domainSkill: DomainSkillRow[];
  trackProfile: TrackProfileRow[];
};
