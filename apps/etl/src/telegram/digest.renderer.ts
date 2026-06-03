import type {
  Currency,
  EnglishLevel,
  Seniority,
  VacancyDto,
  WorkFormat,
} from "../feed/feed.contract";

// Rich-card digest rendering for Telegram HTML (`parse_mode: "HTML"`).
// Principles (see md/journal/migrations/tg-notifications.md#decisions):
// graceful degradation (render a field only when present), no seniority dup
// (skip the chip when the title already says it), english as CEFR, skills
// capped. All dynamic text is HTML-escaped.

const MAX_SKILLS = 5;

const SENIORITY_LABEL: Record<Seniority, string> = {
  INTERN: "Intern",
  JUNIOR: "Junior",
  MIDDLE: "Middle",
  SENIOR: "Senior",
  LEAD: "Lead",
  PRINCIPAL: "Principal",
  C_LEVEL: "C-Level",
};

const WORK_FORMAT_LABEL: Record<WorkFormat, string> = {
  REMOTE: "Remote",
  OFFICE: "Office",
  HYBRID: "Hybrid",
};

// Raw scraped titles run long ("… (Python / Node.js / JS/TS / GCP) with
// Claude Code") — trim the subtitle so it distinguishes the role without
// swamping the card.
const MAX_TITLE_LEN = 52;

function trimTitle(title: string): string {
  const t = title.trim();
  if (t.length <= MAX_TITLE_LEN) return t;
  return `${t.slice(0, MAX_TITLE_LEN - 1).trimEnd()}…`;
}

const ENGLISH_CEFR: Record<EnglishLevel, string> = {
  BEGINNER: "A1",
  INTERMEDIATE: "B1",
  UPPER_INTERMEDIATE: "B2",
  ADVANCED: "C1",
  NATIVE: "C2",
};

const CURRENCY_SYMBOL: Record<Currency, string> = {
  USD: "$",
  EUR: "€",
  UAH: "₴",
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatSalary(salary: VacancyDto["salary"]): string | null {
  const { min, max, currency } = salary;
  if (min == null && max == null) return null;
  const sym = currency ? CURRENCY_SYMBOL[currency] : "";
  if (min != null && max != null) return `${sym}${min}–${max}`;
  if (min != null) return `from ${sym}${min}`;
  return `up to ${sym}${max}`;
}

function joinChips(parts: (string | null | undefined)[]): string | null {
  const present = parts.filter((p): p is string => !!p);
  return present.length > 0 ? present.join(" · ") : null;
}

function locationChip(locations: string[]): string | null {
  if (locations.length === 0) return null;
  const shown = locations.slice(0, 2).join(" · ");
  const extra = locations.length - 2;
  return extra > 0 ? `${shown} +${extra}` : shown;
}

function renderCard(v: VacancyDto): string {
  const lines: string[] = [];

  // Headline = the clean taxonomy role (the raw scraped title is noisy). The
  // diamond is the only card marker — monochrome, CLI-ish. Seniority rides the
  // headline since canonical role names never carry a level.
  const headline = v.role?.name ?? v.title;
  const seniority = v.seniority ? SENIORITY_LABEL[v.seniority] : null;
  lines.push(
    `◆ <b>${escapeHtml(headline)}</b>${seniority ? ` · ${seniority}` : ""}`,
  );

  // Subtitle = trimmed raw title, to tell apart vacancies sharing a role.
  // Skip when it adds nothing (role unresolved → title is already the headline,
  // or the title is just the role name).
  if (v.role && v.title.trim().toLowerCase() !== v.role.name.toLowerCase()) {
    lines.push(`<i>${escapeHtml(trimTitle(v.title))}</i>`);
  }

  if (v.skills.required.length > 0) {
    const names = v.skills.required.slice(0, MAX_SKILLS).map((s) => s.name);
    const extra = v.skills.required.length - names.length;
    const tail = extra > 0 ? ` +${extra}` : "";
    lines.push(`${escapeHtml(names.join(" · "))}${tail}`);
  }

  // One meta line, no field emoji — content self-labels (company, format,
  // place, $salary, EN level).
  const meta = joinChips([
    v.company ? escapeHtml(v.company.name) : null,
    v.workFormat ? WORK_FORMAT_LABEL[v.workFormat] : null,
    locationChip(v.locations.map(escapeHtml)),
    formatSalary(v.salary),
    v.englishLevel ? `EN ${ENGLISH_CEFR[v.englishLevel]}` : null,
  ]);
  if (meta) lines.push(meta);

  if (v.link) {
    lines.push(
      `→ <a href="${escapeHtml(v.link)}">${escapeHtml(v.source.displayName)}</a>`,
    );
  }

  return lines.join("\n");
}

export interface DigestMeta {
  /** Total matching vacancies within the window (the "N new" headline count). */
  totalNew: number;
  windowDays: number;
}

/** Render a digest: a headline count + one rich card per vacancy. */
export function renderDigest(
  vacancies: VacancyDto[],
  { totalNew, windowDays }: DigestMeta,
): string {
  const header = `⌖ <b>${totalNew}</b> нових за ${windowDays} дн`;
  if (vacancies.length === 0) return header;

  // Each card starts with ◆, so a blank line between cards is enough — no rules.
  const cards = vacancies.map(renderCard).join("\n\n");
  return `${header}\n\n${cards}`;
}
