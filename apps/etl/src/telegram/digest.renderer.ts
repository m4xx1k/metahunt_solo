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

const WORK_FORMAT_CHIP: Record<WorkFormat, string> = {
  REMOTE: "🏠 Remote",
  OFFICE: "🏢 Office",
  HYBRID: "🔀 Hybrid",
};

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

function seniorityChip(v: VacancyDto): string | null {
  if (!v.seniority) return null;
  const label = SENIORITY_LABEL[v.seniority];
  // Skip when the source title already carries the level — avoids
  // "Senior Backend Engineer · Senior".
  if (v.title.toLowerCase().includes(label.toLowerCase())) return null;
  return label;
}

function joinChips(parts: (string | null | undefined)[]): string | null {
  const present = parts.filter((p): p is string => !!p);
  return present.length > 0 ? present.join(" · ") : null;
}

function renderCard(v: VacancyDto): string {
  const lines: string[] = [];

  lines.push(`💼 <b>${escapeHtml(v.title)}</b>`);

  const company = joinChips([
    v.company ? `🏢 ${escapeHtml(v.company.name)}` : null,
    seniorityChip(v),
  ]);
  if (company) lines.push(company);

  if (v.skills.required.length > 0) {
    const names = v.skills.required.slice(0, MAX_SKILLS).map((s) => s.name);
    const extra = v.skills.required.length - names.length;
    const tail = extra > 0 ? ` +${extra}` : "";
    lines.push(`🧩 ${escapeHtml(names.join(" · "))}${tail}`);
  }

  const place = joinChips([
    v.locations.length > 0 ? `📍 ${escapeHtml(v.locations.join(" · "))}` : null,
    v.workFormat ? WORK_FORMAT_CHIP[v.workFormat] : null,
  ]);
  if (place) lines.push(place);

  const comp = joinChips([
    formatSalary(v.salary) ? `💰 ${formatSalary(v.salary)}` : null,
    v.englishLevel ? `🇬🇧 ${ENGLISH_CEFR[v.englishLevel]}` : null,
  ]);
  if (comp) lines.push(comp);

  if (v.link) {
    lines.push(
      `👉 <a href="${escapeHtml(v.link)}">Apply on ${escapeHtml(v.source.displayName)}</a>`,
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
  const header = `🔔 <b>${totalNew}</b> нових вакансій за ${windowDays} дн`;
  if (vacancies.length === 0) return header;

  const cards = vacancies.map(renderCard).join("\n──────────────────\n");
  return `${header}\n━━━━━━━━━━━━━━━━━━\n${cards}`;
}
