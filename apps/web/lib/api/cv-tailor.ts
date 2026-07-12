import { apiGet, apiPost } from "./client";

// CV tailoring — mirrors apps/etl/.../cv/cv-tailor.contract.ts. The fact-locked
// transform: SELECT / REORDER / REPHRASE, every bullet checked by the guard.

export interface EntitySet {
  tech: string[];
  orgs: string[];
  metrics: string[];
  dates: string[];
  titles: string[];
}

export type DriftKind =
  | "added-tech"
  | "invented-metric"
  | "off-ledger-org"
  | "off-ledger-date"
  | "off-ledger-title"
  | "inflation";

export interface DriftFlag {
  kind: DriftKind;
  token: string;
  message: string;
}

export interface GuardResult {
  faithful: boolean;
  flags: DriftFlag[];
  tailoredEntities: EntitySet;
}

export type BulletMode = "verbatim" | "rephrased" | "dropped";

export interface BulletDiff {
  sourceBulletId: string;
  sourceText: string;
  tailoredText: string;
  mode: BulletMode;
  relevance: number;
  sourceEntities: EntitySet;
  verdict: GuardResult;
}

export interface TailoredExperience {
  id: string;
  role: string;
  org: string;
  dates: string;
  context: string;
  bullets: BulletDiff[];
  dropped: BulletDiff[];
}

export interface TailoredProject {
  id: string;
  name: string;
  meta: string;
  link: string;
  context: string;
  bullets: BulletDiff[];
  dropped: BulletDiff[];
}

export interface SkillGroup {
  group: string;
  items: string[];
  added?: boolean; // hard-level: injected because the vacancy requires it (absent from the CV)
}

export interface ResumeContacts {
  location?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  github?: string;
  telegram?: string;
}

export interface EducationEntry {
  degree: string;
  school: string;
  dates: string;
}

export interface GroundingSummary {
  totalBullets: number;
  shown: number;
  verbatim: number;
  rephrased: number;
  drift: number;
  inventedFacts: 0;
}

export interface TailoredResume {
  name: string;
  title: string;
  contacts: ResumeContacts;
  summary: BulletDiff;
  skills: SkillGroup[];
  experience: TailoredExperience[];
  projects: TailoredProject[];
  education: EducationEntry[];
}

export interface TailorTarget {
  vacancyId: string | null;
  label: string;
  matchedSkills: string[];
  allSkills: string[];
}

export interface TailorGap {
  fitPercent: number;
  missing: { name: string; weight: number }[];
  learnNext: { skill: string; addedRoles: number }[];
}

export type MatchLevel = "light" | "medium" | "hard";

export type DisclosureKind = "reworded" | "dropped" | "reordered" | "added-skill";

// One plain-language line for the "what we changed vs your original" strip.
export interface Disclosure {
  kind: DisclosureKind;
  text: string;
  verify: boolean; // true → the change asserts something not in the CV
}

export interface TailorResult {
  candidateId: string;
  target: TailorTarget;
  level: MatchLevel;
  rephrase: boolean;
  grounding: GroundingSummary;
  gap: TailorGap | null;
  disclosure: Disclosure[];
  resume: TailoredResume;
}

export interface TailorRequest {
  vacancyId?: string;
  jobText?: string;
  rephrase?: boolean;
  level?: MatchLevel;
}

export interface CoverLetterDraft {
  text: string;
  flags: DriftFlag[];
}

export interface InterviewItem {
  question: string;
  angle: string;
  evidence: string;
}

export interface ApplyKitResult {
  target: TailorTarget;
  coverLetter: CoverLetterDraft;
  interview: InterviewItem[];
}

export interface ApplyKitRequest {
  vacancyId?: string;
  jobText?: string;
}

export interface VerifyBulletRequest {
  sourceText: string;
  tailoredText: string;
  sourceEntities: EntitySet;
  ledgerTech?: string[];
}

export interface GuardDemoCase {
  title: string;
  note: string;
  sourceText: string;
  tailoredText: string;
  sourceEntities: EntitySet;
  ledgerTech: string[];
  expectedFaithful: boolean;
  result: GuardResult;
}

export const cvTailorApi = {
  tailor: (candidateId: string, body: TailorRequest) =>
    apiPost<TailorResult>(`/cv/${candidateId}/tailor`, body),

  // Parse a full structured resume (one LLM call; no-op if already done) so an
  // uploaded/selected CV becomes tailorable.
  structure: (candidateId: string, force = false) =>
    apiPost<{ hasStructured: boolean }>(`/cv/${candidateId}/structure`, { force }),

  // Grounded cover letter + interview prep for the target job (LLM).
  applyKit: (candidateId: string, body: ApplyKitRequest) =>
    apiPost<ApplyKitResult>(`/cv/${candidateId}/apply-kit`, body),

  // Live subset-guard re-check of a manual edit (deterministic, no LLM).
  verify: (body: VerifyBulletRequest) => apiPost<GuardResult>(`/cv/tailor/verify`, body),

  // Canned before→after cases run through the real guard (no LLM).
  guardDemo: () => apiGet<GuardDemoCase[]>(`/cv/tailor/guard-demo`),
};
