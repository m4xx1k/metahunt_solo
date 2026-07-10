/**
 * Gate 1 — the cheap, recall-biased ingest prefilter. Answers "is this worth
 * spending extraction tokens on?", NOT "should we show it to users?" (that's
 * the LLM-derived `vacancies.is_tech` serve gate). See
 * md/todo/ats-sources/tech-filter-implementation.md.
 *
 * Scope: dev-core + QA/DevOps/Data/security. Explicitly NOT PM/design/sales.
 *
 * Rules (ordered):
 *   1. department (ATS only): TECH → pass, NONTECH → block, else fall through
 *   2. title: BLACKLIST stem → block, WHITELIST token → pass
 *   3. UNKNOWN → block (strict; RSS feeds are tech-heavy, dev-core scope)
 */

export type TechGateStage =
  "dept_pass" | "dept_block" | "blacklist" | "whitelist" | "unknown_block";

export interface TechGateInput {
  title: string;
  /** From ATS structured fields only — RSS items have no department. */
  department?: string;
}

export interface TechGateResult {
  pass: boolean;
  stage: TechGateStage;
}

// lowercase → NFC → collapse separators to a single space → trim.
// Keeps `.` `#` `+` so "c#", "c++", ".net", "node.js" survive intact.
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFC")
    .replace(/[\s_/|,–—-]+/g, " ")
    .trim();
}

// The role portion only — strip the employer/location tail that UA/EN RSS
// titles append after " в " / " at " (e.g. "Backend Engineer в NDA
// Recruitment"). The blacklist scans this so company names don't false-block
// ("NDA Recruitment", "Конструкторське бюро", "Growe Talents"); the whitelist
// still scans the full title, so it can only ever rescue, never lose a hit.
function rolePart(normalized: string): string {
  return normalized.split(/ (?:в|at) /)[0] ?? normalized;
}

// The role's FUNCTION, with parenthetical qualifiers stripped. The blacklist
// scans this so a system/skill named in parens isn't read as the role itself:
// "QA Engineer (Siebel CRM)" is a tester (head "qa engineer"), not a CRM role,
// whereas "CRM Team Lead" keeps "crm" in the head and is still blocked. Gate 1
// is recall-biased — a rare junk role whose only tell is parenthetical falls
// through to the LLM `isTech` gate, which reads the full body.
function roleHead(normalized: string): string {
  return normalized
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Unicode-safe word boundary (JS `\b` is ASCII-only — every Cyrillic pattern
// in the old filter was dead code). Use for short/ambiguous tokens that would
// false-match as substrings (hr, pr, ai, ml, qa, ui, ux …). Stems that are
// safe as substrings (develop, engineer, recruit) stay bare.
const word = (body: string): RegExp =>
  new RegExp(`(?<![\\p{L}\\p{N}])(?:${body})(?![\\p{L}\\p{N}])`, "iu");

const TECH_DEPTS = new Set([
  "engineering",
  "software",
  "development",
  "data",
  "it",
  "r&d",
  "research and development",
  "devops",
  "infrastructure",
  "platform",
  "security",
  "qa",
  "quality",
]);

const NONTECH_DEPTS = new Set([
  "sales",
  "marketing",
  "growth",
  "people",
  "hr",
  "human resources",
  "talent",
  "recruiting",
  "finance",
  "legal",
  "support",
  "customer success",
  "customer service",
  "operations",
  "administrative",
  "design",
  "product",
  "project management",
]);

// Match FUNCTION STEMS, not exact titles — kills "Media Buying Team Lead"
// (bug 2: blacklist `media buyer` missed, whitelist `team lead` then fired).
const BLACKLIST: RegExp[] = [
  /media\s?buy/iu,
  /user\s?acquisition/iu,
  word("aso"),
  /influencer/iu,
  word("ppc"),
  word("seo"),
  word("smm"),
  /affiliate/iu,
  // end-boundary so "Lead Generation" matches but "Lead General QA" does not
  /lead\s?gen(eration)?(?![\p{L}\p{N}])/iu,
  /copywrit/iu,
  /content/iu,
  /brand/iu,
  word("pr"),
  /retention/iu,
  word("crm"),
  /recruit/iu,
  // word-bounded so the company "Growe Talents" doesn't block the role
  word("talent"),
  word("hr"),
  /human\s?resources/iu,
  /headhunt/iu,
  /people\s?(partner|ops)/iu,
  word("sales"),
  /account\s?manager/iu,
  /bizdev/iu,
  // "Business Development" is sales, not dev — block it before the whitelist's
  // /develop(er|ment)/ rescues it on the word "development".
  /business\s?develop/iu,
  /customer\s?(success|service|support)/iu,
  /lawyer/iu,
  /legal/iu,
  /accountant/iu,
  /бухгалтер/iu,
  /financ/iu,
  /translat/iu,
  /teacher/iu,
  /trainer/iu,
  /(?<![\p{L}\p{N}])(?:product|project)\s?manager/iu,
  word("pm"),
  word("po"),
  /scrum\s?master/iu,
  /delivery\s?manager/iu,
  /designer/iu,
  /дизайнер/iu,
  // NB: standalone ui/ux removed — they matched QA skill lists ("UI Automation",
  // "UI, Load, API"). /designer/ already covers "UI/UX Designer".
  /interior/iu,
  // NB: /graphic/ removed — it blocked graphics *programmers* ("Web Graphics
  // Developer", "3D Graphics Engineer"). /designer/ still covers "Graphic Designer".
  /motion/iu,
  /mechanical/iu,
  /civil/iu,
  /electrical/iu,
  /електрик/iu,
  /конструктор/iu,
];

// Tech roles + stacks (dev + QA + DevOps + data + security).
const WHITELIST: RegExp[] = [
  /develop(er|ment)/iu,
  /розробник/iu,
  /engineer/iu,
  /інженер/iu,
  /programmer/iu,
  word("coder"),
  /architect/iu,
  /архітектор/iu,
  /tech\s?lead/iu,
  /team\s?lead/iu,
  word("cto"),
  word("qa"),
  /tester/iu,
  /quality\s?assurance/iu,
  word("sdet"),
  word("aqa"),
  /тестувальник/iu,
  /devops/iu,
  word("sre"),
  /reliability/iu,
  /sysadmin/iu,
  /administrator/iu,
  /security/iu,
  /pentest/iu,
  /infosec/iu,
  /кібербезпек/iu,
  /front\s?end/iu,
  /back\s?end/iu,
  /full\s?stack/iu,
  /mobile/iu,
  /android/iu,
  word("ios"),
  /data\s?(scientist|analyst|engineer)/iu,
  /machine\s?learning/iu,
  word("ml"),
  word("ai"),
  word("dba"),
  /database/iu,
  /аналітик\s?даних/iu,
  /embedded/iu,
  /firmware/iu,
  /hardware/iu,
  word(
    "python|javascript|typescript|java|golang|rust|php|ruby|kotlin|swift|solidity|react|angular|vue|nodejs|node|django|laravel|spring|flutter|kubernetes|terraform|c\\+\\+|c#|\\.net",
  ),
];

export function passesTechGate(input: TechGateInput): TechGateResult {
  if (input.department) {
    const dept = normalize(input.department);
    if (TECH_DEPTS.has(dept)) return { pass: true, stage: "dept_pass" };
    if (NONTECH_DEPTS.has(dept)) return { pass: false, stage: "dept_block" };
  }

  const title = normalize(input.title);
  const head = roleHead(rolePart(title));

  for (const re of BLACKLIST) {
    if (re.test(head)) return { pass: false, stage: "blacklist" };
  }
  for (const re of WHITELIST) {
    if (re.test(title)) return { pass: true, stage: "whitelist" };
  }
  return { pass: false, stage: "unknown_block" };
}
