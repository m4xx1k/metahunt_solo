import type { Seniority } from "./contract";

/**
 * Deterministic contract for the small, ambiguous part of job titles.
 *
 * The LLM still classifies the underlying technical discipline. This policy
 * deliberately owns only title semantics which must agree across sources:
 * seniority, QA/mobile variants, architect specialisations, and generic lead
 * labels.  It is applied after extraction and reused by backfills.
 */
const LEVEL_ORDER: Seniority[] = [
  "INTERN",
  "JUNIOR",
  "MIDDLE",
  "SENIOR",
  "LEAD",
  "PRINCIPAL",
  "C_LEVEL",
];

export interface RoleSeniorityInput {
  text: string;
  role: string | null;
  seniority: Seniority | null;
  experienceYears: number | null;
  knownRoles: Iterable<string>;
}

export interface RoleSeniorityOutput {
  role: string | null;
  seniority: Seniority | null;
}

export function vacancyTitle(text: string): string {
  const title = text.match(/^\s*title\s*:\s*([^\n]+)/im)?.[1] ?? text.split("\n")[0] ?? text;
  return title
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function applyRoleSeniorityPolicy(input: RoleSeniorityInput): RoleSeniorityOutput {
  const title = vacancyTitle(input.text);
  const known = new Set(input.knownRoles);
  const role = chooseRole(title, input.role, known);
  // Preserve an existing level when replaying historic LLM output unless the
  // title itself gives contrary evidence. New extraction asks the model for
  // title-only evidence, so the tenure fallback still fills a null naturally.
  const explicit = titleSeniority(title, null);
  const seniority = explicit ?? input.seniority ?? titleSeniority(title, input.experienceYears);
  return { role, seniority };
}

/** Title evidence wins. Years only fill ordinary, unlabelled IC postings. */
export function titleSeniority(title: string, experienceYears: number | null): Seniority | null {
  const normalized = ` ${title.toLowerCase()} `;
  if (/\b(cto|cio|ciso|chief\s+(technology|information|security)\s+officer)\b/.test(normalized)) {
    return "C_LEVEL";
  }
  const found: Seniority[] = [];
  if (/\b(intern|internship|trainee)\b/.test(normalized)) found.push("INTERN");
  if (/\b(junior|jr\.?|jun)\b/.test(normalized)) found.push("JUNIOR");
  if (/\b(middle|mid[- ]?level|mid)\b/.test(normalized)) found.push("MIDDLE");
  if (/\b(senior|sr\.?)\b/.test(normalized)) found.push("SENIOR");
  if (
    /\b(team\s*lead|tech(?:nical)?\s*lead|head\s+of|director|vice\s+president|\bvp\b|\blead\b)\b/.test(
      normalized,
    )
  )
    found.push("LEAD");
  if (/\b(principal|staff|distinguished|fellow)\b/.test(normalized)) found.push("PRINCIPAL");
  if (found.length > 0)
    return found.sort((a, b) => LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b))[0];

  // Never manufacture INTERN or upper-tail levels from tenure.  A vacancy
  // without an advertised title level gets a conservative IC fallback only.
  if (experienceYears === null || !Number.isFinite(experienceYears)) return null;
  if (experienceYears <= 1) return "JUNIOR";
  if (experienceYears <= 3) return "MIDDLE";
  return "SENIOR";
}

function chooseRole(title: string, extracted: string | null, known: Set<string>): string | null {
  const lower = title.toLowerCase();
  const pick = (...names: string[]) => names.find((name) => known.has(name)) ?? extracted;
  if (
    /\b(manual|functional)\s+(qa|quality assurance|tester)\b|\b(qa|quality assurance)\s+(manual|functional)\b/.test(
      lower,
    )
  )
    return pick("Manual QA Engineer", "QA Engineer");
  if (
    /\b(automation|automated)\s+(qa|quality assurance|tester)\b|\b(qa|quality assurance)\s+(automation|automated)\b|\b(sdet|aqa|test automation)\b/.test(
      lower,
    )
  )
    return pick("Automation QA Engineer", "QA Engineer");
  if (/\bqa\b|\bquality assurance\b/.test(lower)) return pick("QA Engineer");
  if (/\b(react native|flutter|xamarin|ionic|capacitor|kotlin multiplatform)\b/.test(lower)) {
    return pick("Cross-platform Mobile Engineer", "Mobile Developer");
  }
  if (
    /\b(ios|iphone|swift|objective-c|objc)\b/.test(lower) &&
    !/\b(android|kotlin)\b/.test(lower)
  ) {
    return pick("iOS Engineer", "Mobile Developer");
  }
  if (/\b(android|aaos)\b/.test(lower) && !/\b(ios|swift|objective-c|objc)\b/.test(lower)) {
    return pick("Android Engineer", "Mobile Developer");
  }
  if (/\bsoftware architect\b/.test(lower)) return pick("Software Architect", "Software Engineer");
  if (/\b(solutions?|solution) architect\b/.test(lower))
    return pick("Solutions Architect", "Software Architect", "Software Engineer");
  // "Data Architect" remains Data Engineer: architecture describes the work,
  // not a standalone engineering discipline in our search taxonomy.
  if (/\bdata architect\b/.test(lower)) return pick("Data Engineer");
  return extracted;
}

const QA_FAMILY = new Set(["QA Engineer", "Manual QA Engineer", "Automation QA Engineer"]);
const MOBILE_FAMILY = new Set([
  "Mobile Developer",
  "Android Engineer",
  "iOS Engineer",
  "Cross-platform Mobile Engineer",
]);

/** Generic parent is compatible with a specialised child; siblings are not. */
export function rolesCompatible(a: string | null, b: string | null): boolean {
  if (!a || !b || a === b) return true;
  if (QA_FAMILY.has(a) && QA_FAMILY.has(b)) return a === "QA Engineer" || b === "QA Engineer";
  if (MOBILE_FAMILY.has(a) && MOBILE_FAMILY.has(b))
    return a === "Mobile Developer" || b === "Mobile Developer";
  return (
    (a === "Hardware Engineer" && b === "RF Engineer") ||
    (b === "Hardware Engineer" && a === "RF Engineer")
  );
}

export function senioritiesCompatible(a: string | null, b: string | null): boolean {
  return !a || !b || a === b;
}
