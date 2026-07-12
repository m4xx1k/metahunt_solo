// CV tailoring contract — the fact-locked transform.
// See md/journal/migrations/cv-cover-letter.md + ADR-0011.
//
// Everything here is grounded: a tailored CV may only SELECT / REORDER / REPHRASE
// the candidate's own fact atoms. The guard (subset-guard.ts) proves no output
// bullet introduces a tech, number, employer, date, or title the source didn't.

// The fact-set of a single claim — the unit the subset check operates on.
export interface EntitySet {
  tech: string[]; // technologies (resolved against a lexicon)
  orgs: string[]; // employers / clients
  metrics: string[]; // numbers, verbatim tokens ("2,800+", "~40%", "80+")
  dates: string[]; // date tokens ("Sep 2025", "2024 – 2025")
  titles: string[]; // job titles
}

// One atomic claim from the CV, grounded to the source text.
export interface FactAtom {
  id: string; // stable, e.g. "exp1.b2"
  text: string;
  sourceSpan: string; // verbatim substring of candidates.source_text
  entities: EntitySet;
}

export interface SkillGroup {
  group: string;
  items: string[]; // each item ⊆ the fact ledger's allowedTech
  added?: boolean; // hard-level: injected because the vacancy requires it (absent from the CV)
}

export interface ExperienceEntry {
  id: string;
  role: string;
  org: string;
  dates: string;
  context: string;
  max?: number; // per-entry bullet cap (mirrors the founder's resume.yaml)
  bullets: FactAtom[];
}

export interface ProjectEntry {
  id: string;
  name: string;
  meta: string;
  link: string;
  context: string;
  bullets: FactAtom[];
}

export interface EducationEntry {
  degree: string;
  school: string;
  dates: string;
}

export interface ResumeContacts {
  location?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  github?: string;
  telegram?: string;
}

// The full structured resume — persisted on candidates.structured (jsonb).
export interface ExtractedResume {
  name: string;
  title: string;
  contacts: ResumeContacts;
  summary: FactAtom;
  skills: SkillGroup[];
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  education: EducationEntry[];
}

// The closed universe every tailored artifact is checked against (derived, not
// stored): the union of every atom's entities across the resume.
export interface FactLedger {
  tech: string[];
  orgs: string[];
  metrics: string[];
  dates: string[];
  titles: string[];
}

// ── Guard (Tier 1, deterministic) ────────────────────────────────────────────

export type DriftKind =
  | "added-tech" // a tech not in the source bullet nor the global ledger
  | "invented-metric" // a number that isn't a verbatim token of the source bullet
  | "off-ledger-org"
  | "off-ledger-date"
  | "off-ledger-title"
  | "inflation"; // semantic scope/seniority inflation (Tier 2 / LLM only)

export interface DriftFlag {
  kind: DriftKind;
  token: string; // the offending token
  message: string; // human-readable reason for the diff UI
}

// Verdict for one tailored/edited bullet.
export interface GuardResult {
  faithful: boolean; // no drift → safe to show as tailored
  flags: DriftFlag[];
  tailoredEntities: EntitySet; // recomputed from the tailored text
}

// ── Tailoring result (what the /cv-tailor page renders) ───────────────────────

export type BulletMode = "verbatim" | "rephrased" | "dropped";

// One before→after row in the diff UI.
export interface BulletDiff {
  sourceBulletId: string;
  sourceText: string;
  tailoredText: string;
  mode: BulletMode;
  relevance: number; // Σ IDF weight of overlap with the target vacancy
  sourceEntities: EntitySet;
  verdict: GuardResult;
}

export interface TailoredExperience {
  id: string;
  role: string;
  org: string;
  dates: string;
  context: string;
  bullets: BulletDiff[]; // selected + reordered (mode verbatim | rephrased)
  dropped: BulletDiff[]; // deselected as less relevant (restorable in the UI)
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

// The "0 invented facts" proof shown at the top of the page.
export interface GroundingSummary {
  totalBullets: number;
  shown: number;
  verbatim: number;
  rephrased: number;
  drift: number; // rephrases rejected by the guard → fell back to verbatim
  inventedFacts: 0; // an invariant, encoded in the type
}

export interface TailoredResume {
  name: string;
  title: string; // may be re-emphasized toward the role, never a new title
  contacts: ResumeContacts;
  summary: BulletDiff;
  skills: SkillGroup[]; // reordered so the most relevant group floats up
  experience: TailoredExperience[];
  projects: TailoredProject[];
  education: EducationEntry[];
}

// The target the CV is tailored against (a stored vacancy or a pasted JD).
export interface TailorTarget {
  vacancyId: string | null;
  label: string; // e.g. "Senior Backend Engineer · Acme" or "Pasted job description"
  matchedSkills: string[]; // vacancy skills the candidate already has (drives SELECT)
  allSkills: string[]; // every skill the vacancy asks for
}

// The market-position flex — what a standalone CV tool can't compute. Derived
// from the live vacancy corpus + taxonomy + counterfactual recommender.
export interface TailorGap {
  fitPercent: number; // IDF-weighted coverage of the target's skills
  missing: { name: string; weight: number }[]; // target skills the CV lacks
  learnNext: { skill: string; addedRoles: number }[]; // learn X → +N live roles
}

// How aggressively the CV is bent toward the vacancy. Each step deviates more
// from the literal original — and every deviation is disclosed (see Disclosure):
//   light  — reorder + trim only; every word stays yours (no LLM).
//   medium — + a bold impact rewrite, guard-locked so no fact is invented.
//   hard   — + adds the vacancy's must-have skills you're missing, flagged for
//            you to verify. Maximum match, maximum responsibility on you.
export type MatchLevel = "light" | "medium" | "hard";

export type DisclosureKind = "reworded" | "dropped" | "reordered" | "added-skill";

// One plain-language line for the "what we changed vs your original" strip. When
// verify=true the change asserts something not in the CV, so the user must
// confirm it's true before sending.
export interface Disclosure {
  kind: DisclosureKind;
  text: string;
  verify: boolean; // true → "keep only if you actually have this"
}

export interface TailorResult {
  candidateId: string;
  target: TailorTarget;
  level: MatchLevel;
  rephrase: boolean; // was the bold LLM rewrite applied?
  grounding: GroundingSummary;
  gap: TailorGap | null; // present when tailored against a target with skills
  disclosure: Disclosure[]; // what changed vs the original — drives the honesty strip
  resume: TailoredResume;
}

// ── Apply-kit (cover letter + interview prep) ─────────────────────────────────

export interface CoverLetterDraft {
  text: string;
  flags: DriftFlag[]; // off-ledger tech/numbers found in the letter (want: none)
}

export interface InterviewItem {
  question: string;
  angle: string;
  evidence: string; // talking point drawn from the candidate's real achievements
}

export interface ApplyKitResult {
  target: TailorTarget;
  coverLetter: CoverLetterDraft;
  interview: InterviewItem[];
}

// POST /cv/:id/apply-kit
export interface ApplyKitRequest {
  vacancyId?: string;
  jobText?: string;
}

// ── Endpoint request bodies ───────────────────────────────────────────────────

// POST /cv/:id/tailor
export interface TailorRequest {
  vacancyId?: string; // rank against a stored vacancy…
  jobText?: string; // …or a pasted job description
  rephrase?: boolean; // opt-in LLM rephrase (gated; default false)
  level?: MatchLevel; // how hard to bend toward the vacancy (default "medium")
}

// POST /cv/tailor/verify — live re-check of a user edit (no LLM).
export interface VerifyBulletRequest {
  sourceText: string;
  tailoredText: string;
  sourceEntities: EntitySet;
  ledgerTech?: string[]; // global-ledger fallback for tech
}

// GET /cv/tailor/guard-demo — canned before→after cases run through the real
// Tier-1 guard, so the "how the guard works" panel shows real verdicts, no LLM.
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
