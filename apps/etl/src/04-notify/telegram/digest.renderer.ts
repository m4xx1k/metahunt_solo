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
// graceful degradation, one vacancy per scheduled message, compact field codes,
// explicit source dates and tracked + direct links. All dynamic text is escaped.

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

const KYIV_DATE_TIME = new Intl.DateTimeFormat("uk-UA", {
  timeZone: "Europe/Kyiv",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

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

function formatKyivDate(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${KYIV_DATE_TIME.format(date)} Kyiv`;
}

function publishedLine(v: VacancyDto): string | null {
  const iso = v.publishedAt ?? v.loadedAt;
  const date = formatKyivDate(iso);
  if (!date) return null;
  return `${v.publishedAt ? "опубл." : "знайдено"} ${date}`;
}

function renderCard(
  v: VacancyDto,
  applyBaseUrl: string,
  webBaseUrl: string,
  subscriptionId?: string,
): string {
  const body: string[] = [];

  if (v.company?.name) {
    body.push(`co   ${escapeHtml(v.company.name)}`);
  }

  const salary = formatSalary(v.salary);
  const context = joinChips([
    v.domain ? `<b>${escapeHtml(v.domain.name)}</b>` : null,
    v.workFormat ? WORK_FORMAT_LABEL[v.workFormat] : null,
    locationChip(v.locations.map(escapeHtml)),
    salary ? `<b>${salary}</b>` : null,
    v.englishLevel ? `EN ${ENGLISH_CEFR[v.englishLevel]}` : null,
    v.experienceYears != null ? `${v.experienceYears}+y` : null,
  ]);
  if (context) body.push(`ctx  ${context}`);

  if (v.skills.required.length > 0) {
    const names = v.skills.required.slice(0, MAX_SKILLS).map((s) => s.name);
    const extra = v.skills.required.length - names.length;
    const tail = extra > 0 ? ` +${extra}` : "";
    const tags = names.map((n) => `[${escapeHtml(n)}]`).join(" ");
    body.push(`req  ${tags}${tail}`);
  }

  const perks = joinChips([
    v.hasReservation === true ? copy.digest.reservation : null,
    v.hasTestAssignment === false
      ? copy.digest.noTest
      : v.hasTestAssignment === true
        ? copy.digest.hasTest
        : null,
  ]);
  if (perks) body.push(`sig  ${perks}`);

  const date = publishedLine(v);
  if (date) body.push(`time ${date}`);

  const links = joinChips([
    `<a href="${escapeHtml(vacancyUrl(webBaseUrl, v))}">metahunt</a>`,
    v.link
      ? `<a href="${escapeHtml(applyUrl(applyBaseUrl, v.id, subscriptionId))}">${escapeHtml(v.source.displayName)}</a>`
      : null,
    v.link ? `<a href="${escapeHtml(v.link)}">direct</a>` : null,
  ]);
  body.push(`-&gt;  ${links}`);

  const role = v.role?.name ?? v.title;
  const seniority = v.seniority ? SENIORITY_LABEL[v.seniority] : null;
  const head = `◆ ${seniority ? `${seniority} · ` : ""}<b>${escapeHtml(role)}</b>`;

  if (body.length === 0) return head;
  return `${head}\n${body.map((line) => `  ${line}`).join("\n")}`;
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
  /** Per-subscription filter label for the header (e.g. "React, Node · 3 скіл."). */
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
  const webBaseUrl = meta.webBaseUrl ?? meta.applyBaseUrl;
  const cards = vacancies
    .map((v) => renderCard(v, meta.applyBaseUrl, webBaseUrl, meta.subscriptionId))
    .join(CARD_SEPARATOR);
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
  const webBaseUrl = meta.webBaseUrl ?? meta.applyBaseUrl;
  return vacancies.map((vacancy, index) => {
    const header = renderHeader(meta.totalNew, meta, {
      index: index + 1,
      count: vacancies.length,
    });
    return {
      html: `${header}${HEADER_GAP}${renderCard(
        vacancy,
        meta.applyBaseUrl,
        webBaseUrl,
        meta.subscriptionId,
      )}`,
      vacancyIds: [vacancy.id],
    };
  });
}
