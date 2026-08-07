import type {
  Currency,
  EnglishLevel,
  Seniority,
  VacancyDto,
  WorkFormat,
} from "../../03-discovery/feed/feed.contract";

import { copy } from "./telegram-copy";

// Rich-card digest rendering for Telegram HTML (`parse_mode: "HTML"`).
// Principles (see md/journal/migrations/tg-notifications.md#decisions):
// graceful degradation, one vacancy per scheduled message, sectioned card
// (fused seniority+role title, itself the metahunt link → salary/company/
// domain → "Деталі:" block, one plain-language sentence per condition
// (skills, English, experience, format, location, reservation, test) →
// "знайдено на <source>"). All dynamic text escaped; no publish date, no
// quoted description (source text arrives as unsanitized HTML — not safe to
// echo into a Telegram HTML message yet).

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

const WORK_FORMAT_SENTENCE: Record<WorkFormat, string> = {
  REMOTE: "Віддалена робота",
  OFFICE: "Робота в офісі",
  HYBRID: "Гібридний формат",
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
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatSalary(salary: VacancyDto["salary"]): string | null {
  const { min, max, currency } = salary;
  if (min == null && max == null) return null;
  const sym = currency ? CURRENCY_SYMBOL[currency] : "";
  if (min != null && max != null) return `${sym}${min}–${max}`;
  if (min != null) return `від ${sym}${min}`;
  return `до ${sym}${max}`;
}

function joinChips(parts: (string | null | undefined)[]): string | null {
  const present = parts.filter((p): p is string => !!p);
  return present.length > 0 ? present.join(" · ") : null;
}

const LOCATION_CITIES_MAX = 3;
const LOCATION_ITEMS_MAX = 2;

// Mirrors apps/web/entities/vacancy/format-locations.ts. Inputs are already
// escaped at the call site — don't escape again when re-embedding.
function locationChip(locations: string[]): string | null {
  if (locations.length === 0) return null;

  const parsed = locations.map((raw) => {
    const idx = raw.indexOf(",");
    return idx === -1
      ? { city: raw.trim(), country: null as string | null }
      : { city: raw.slice(0, idx).trim(), country: raw.slice(idx + 1).trim() };
  });

  const sharedCountry =
    parsed.every((p) => p.country) && new Set(parsed.map((p) => p.country)).size === 1
      ? parsed[0].country
      : null;

  if (sharedCountry) {
    const cities = parsed.map((p) => p.city);
    if (cities.length === 1) return `${cities[0]}, ${sharedCountry}`;
    const head = cities.slice(0, LOCATION_CITIES_MAX).join(", ");
    const overflow =
      cities.length > LOCATION_CITIES_MAX ? `, +${cities.length - LOCATION_CITIES_MAX}` : "";
    return `${sharedCountry} (${head}${overflow})`;
  }

  const items = parsed.map((p) => (p.country ? `${p.city}, ${p.country}` : p.city));
  const head = items.slice(0, LOCATION_ITEMS_MAX).join(" · ");
  const overflow =
    items.length > LOCATION_ITEMS_MAX ? ` +${items.length - LOCATION_ITEMS_MAX}` : "";
  return `${head}${overflow}`;
}

// Build the outbound apply URL. Carries `?s=<subscriptionId>` when known so the
// `/go/:id` redirect can attribute the click back to the referring subscription
// (omitted for the `/preview` sample, which has no subscription).
function applyUrl(applyBaseUrl: string, vacancyId: string, subscriptionId?: string): string {
  const base = `${applyBaseUrl}/go/${vacancyId}`;
  return subscriptionId ? `${base}?s=${subscriptionId}` : base;
}

function slugifyForUrl(input: string): string {
  return (
    input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "vacancy"
  );
}

function vacancyUrl(webBaseUrl: string, v: VacancyDto): string {
  const role = v.role?.name ?? v.title;
  return `${webBaseUrl}/vacancy/${slugifyForUrl(role)}-${v.id}`;
}

function renderSkills(skills: VacancyDto["skills"]["required"]): string | null {
  if (skills.length === 0) return null;
  const names = skills.slice(0, MAX_SKILLS).map((s) => s.name);
  const extra = skills.length - names.length;
  const tail = extra > 0 ? ` +${extra}` : "";
  const tags = names.map((n) => `[${escapeHtml(n)}]`).join(" ");
  return `${tags}${tail}`;
}

// Every condition as its own plain-language line under "Деталі:" instead of
// terse chips on a shared row — reads like someone telling you about the job,
// not a spec sheet. Order: what you'd need to bring, then what the job is.
function renderDetails(v: VacancyDto): string[] {
  const lines: string[] = [];

  const skillsLine = renderSkills(v.skills.required);
  if (skillsLine) lines.push(`Навички: ${skillsLine}`);
  if (v.englishLevel) lines.push(`Англійська — ${ENGLISH_CEFR[v.englishLevel]}`);
  if (v.experienceYears != null) lines.push(`Від ${v.experienceYears} років досвіду`);
  if (v.workFormat) lines.push(WORK_FORMAT_SENTENCE[v.workFormat]);
  const location = locationChip(v.locations.map(escapeHtml));
  if (location) lines.push(`Локація: ${location}`);
  if (v.hasReservation === true) lines.push(copy.digest.reservation);
  if (v.hasTestAssignment === true) lines.push(copy.digest.hasTest);
  if (v.hasTestAssignment === false) lines.push(copy.digest.noTest);

  return lines;
}

function renderCard(v: VacancyDto, meta: DigestMeta): string {
  const body: string[] = [];

  const salary = formatSalary(v.salary);
  const headline = joinChips([
    salary ? `<b>${salary}</b>` : null,
    // Underlined, not bold — a named-entity cue that doesn't compete with the
    // salary/role bold accents already carrying the eye.
    v.company?.name ? `<u>${escapeHtml(v.company.name)}</u>` : null,
    v.domain ? escapeHtml(v.domain.name) : null,
  ]);
  if (headline) body.push(headline);

  const details = renderDetails(v);
  if (details.length > 0) {
    body.push("", "Деталі:", ...details);
  }

  if (v.link) {
    body.push(
      "",
      `знайдено на <a href="${escapeHtml(applyUrl(meta.applyBaseUrl, v.id, meta.subscriptionId))}">${escapeHtml(v.source.displayName)}</a>`,
    );
  }

  const webBaseUrl = meta.webBaseUrl ?? meta.applyBaseUrl;
  const role = v.role?.name ?? v.title;
  const seniority = v.seniority ? SENIORITY_LABEL[v.seniority] : null;
  const titleText = `${seniority ? `${escapeHtml(seniority)} ` : ""}${escapeHtml(role)}`;
  const head = `◆ <a href="${escapeHtml(vacancyUrl(webBaseUrl, v))}"><b>${titleText}</b></a>`;

  if (body.length === 0) return head;
  return `${head}\n${body.map((line) => (line ? `  ${line}` : "")).join("\n")}`;
}

// A dotted rule between cards for `/preview`, which is still one sample message.
const CARD_DIVIDER = "┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈";
const CARD_SEPARATOR = `\n${CARD_DIVIDER}\n`;
const HEADER_GAP = "\n\n";

export interface DigestMeta {
  /** Total matching vacancies (the "N new" headline count). */
  totalNew: number;
  /** Public origin for building `/go/:id` apply-redirect links. */
  applyBaseUrl: string;
  /** Public web origin for canonical `/vacancy/...` detail links. */
  webBaseUrl?: string;
  /**
   * Rolling window in days. Present → "за N дн" framing (the `/preview` sample);
   * omit for scheduled digests, which carry only genuinely-new vacancies.
   */
  windowDays?: number;
  /** Header label for the single-message `renderDigest` sample (e.g. `/preview`'s filter description). */
  label?: string;
  /** Referring subscription — stamps apply links with `?s=<id>` for click
   * attribution. Omitted for the `/preview` sample (no subscription). */
  subscriptionId?: string;
}

function renderHeader(
  totalNew: number,
  { windowDays, label }: Pick<DigestMeta, "windowDays" | "label">,
  page?: { index: number; count: number },
): string {
  const window = windowDays !== undefined ? copy.digest.window(windowDays) : "";
  const filter = label ? ` · ${escapeHtml(label)}` : "";
  const pager = page && page.count > 1 ? ` (${page.index}/${page.count})` : "";
  return copy.digest.header(totalNew, window, filter, pager);
}

/** Render a digest as a single message — headline + one card per vacancy (used by `/preview`). */
export function renderDigest(vacancies: VacancyDto[], meta: DigestMeta): string {
  const header = renderHeader(meta.totalNew, meta);
  if (vacancies.length === 0) return header;
  const cards = vacancies.map((v) => renderCard(v, meta)).join(CARD_SEPARATOR);
  return `${header}${HEADER_GAP}${cards}`;
}

/** One Telegram message + the vacancy ids it covers (so the caller records them after a successful send). */
export interface DigestPage {
  html: string;
  vacancyIds: string[];
}

/**
 * Scheduled delivery sends one vacancy per message. The first message is allowed
 * to notify; follow-ups in the same batch are sent silently by DigestService.
 */
export function paginateDigest(vacancies: VacancyDto[], meta: DigestMeta): DigestPage[] {
  if (vacancies.length === 0) return [];
  return vacancies.map((vacancy) => ({
    html: renderCard(vacancy, meta),
    vacancyIds: [vacancy.id],
  }));
}
