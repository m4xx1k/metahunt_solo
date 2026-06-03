import type {
  Currency,
  EnglishLevel,
  Seniority,
  VacancyDto,
  WorkFormat,
} from "../feed/feed.contract";

// Rich-card digest rendering for Telegram HTML (`parse_mode: "HTML"`).
// Principles (see md/journal/migrations/tg-notifications.md#decisions):
// graceful degradation (render a field only when present), headline = seniority
// then clean role (the noisy scraped title is dropped), english as CEFR with a
// flag, reservation accented (a real draw in the UA market), skills capped. All
// dynamic text is HTML-escaped.

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

// Relative "X тому" via the platform Intl — no bespoke pluraliser.
// `numeric: "auto"` yields idiomatic forms ("учора", "минулого тижня").
const RELATIVE_TIME = new Intl.RelativeTimeFormat("uk", { numeric: "auto" });
const TIME_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000_000],
  ["month", 2_592_000_000],
  ["week", 604_800_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

function relativeTime(iso: string): string | null {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diffMs = then - Date.now(); // negative → past
  for (const [unit, unitMs] of TIME_UNITS) {
    if (Math.abs(diffMs) >= unitMs) {
      return RELATIVE_TIME.format(Math.round(diffMs / unitMs), unit);
    }
  }
  return RELATIVE_TIME.format(0, "minute"); // < 1 min → "цієї хвилини"
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

function renderCard(v: VacancyDto, applyBaseUrl: string): string {
  const lines: string[] = [];

  // Headline = seniority then the clean taxonomy role (the raw scraped title is
  // noisy, so it's dropped). The diamond is the only card marker — monochrome,
  // CLI-ish. Seniority leads since canonical role names never carry a level.
  const role = v.role?.name ?? v.title;
  const seniority = v.seniority ? SENIORITY_LABEL[v.seniority] : null;
  lines.push(
    `◆ ${seniority ? `${seniority} · ` : ""}<b>${escapeHtml(role)}</b>`,
  );

  // Muted domain line, italic so it reads as a subtitle without competing with
  // the bold headline. (Freshness lives in the footer, next to the apply link.)
  if (v.domain) lines.push(`<i>${escapeHtml(v.domain.name)}</i>`);

  if (v.skills.required.length > 0) {
    const names = v.skills.required.slice(0, MAX_SKILLS).map((s) => s.name);
    const extra = v.skills.required.length - names.length;
    const tail = extra > 0 ? ` +${extra}` : "";
    lines.push(`${escapeHtml(names.join(" · "))}${tail}`);
  }

  // One meta line — content self-labels. Accents kept light: salary bold (rare
  // but a strong draw), a flag on the English level so it reads at a glance.
  const salary = formatSalary(v.salary);
  const meta = joinChips([
    v.workFormat ? WORK_FORMAT_LABEL[v.workFormat] : null,
    locationChip(v.locations.map(escapeHtml)),
    salary ? `<b>${salary}</b>` : null,
    v.englishLevel ? `🇬🇧 ${ENGLISH_CEFR[v.englishLevel]}` : null,
  ]);
  if (meta) lines.push(meta);

  // Perks line: reservation accented (deferment from mobilization is a top draw
  // in the UA market), test task flagged plainly. Only shown when known true.
  const perks = joinChips([
    v.hasReservation ? "🛡 <b>Бронювання</b>" : null,
    v.hasTestAssignment ? "📝 Тестове" : null,
  ]);
  if (perks) lines.push(perks);

  // Footer: apply link + freshness, muted at the end. The link routes through
  // our `/go/:id` redirect (not straight to source) so the tap passes through
  // metahunt and can be tracked later.
  const posted = v.publishedAt ?? v.loadedAt;
  const age = posted ? relativeTime(posted) : null;
  const footer = joinChips([
    v.link
      ? `→ <a href="${escapeHtml(`${applyBaseUrl}/go/${v.id}`)}">${escapeHtml(v.source.displayName)}</a>`
      : null,
    age ? `<i>${age}</i>` : null,
  ]);
  if (footer) lines.push(footer);

  return lines.join("\n");
}

export interface DigestMeta {
  /** Total matching vacancies within the window (the "N new" headline count). */
  totalNew: number;
  windowDays: number;
  /** Public origin for building `/go/:id` apply-redirect links. */
  applyBaseUrl: string;
  /** Per-subscription filter label for the header (e.g. "React, Node · 3 скіл."). */
  label?: string;
}

/** Render a digest: a headline count + one rich card per vacancy. */
export function renderDigest(
  vacancies: VacancyDto[],
  { totalNew, windowDays, applyBaseUrl, label }: DigestMeta,
): string {
  const tail = label ? ` · ${escapeHtml(label)}` : "";
  const header = `⌖ <b>${totalNew}</b> нових за ${windowDays} дн${tail}`;
  if (vacancies.length === 0) return header;

  // Each card starts with ◆, so a blank line between cards is enough — no rules.
  const cards = vacancies.map((v) => renderCard(v, applyBaseUrl)).join("\n\n");
  return `${header}\n\n${cards}`;
}
