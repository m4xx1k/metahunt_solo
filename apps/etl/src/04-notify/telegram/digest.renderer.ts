import type {
  Currency,
  EnglishLevel,
  Seniority,
  VacancyDto,
  WorkFormat,
} from "../../03-discovery/feed/feed.contract";

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

// Build the outbound apply URL. Carries `?s=<subscriptionId>` when known so the
// `/go/:id` redirect can attribute the click back to the referring subscription
// (omitted for the `/preview` sample, which has no subscription).
function applyUrl(
  applyBaseUrl: string,
  vacancyId: string,
  subscriptionId?: string,
): string {
  const base = `${applyBaseUrl}/go/${vacancyId}`;
  return subscriptionId ? `${base}?s=${subscriptionId}` : base;
}

function renderCard(
  v: VacancyDto,
  applyBaseUrl: string,
  subscriptionId?: string,
): string {
  // The ◆ headline stays flush-left; everything else is a 2-space-indented body
  // so each card reads as a titled block. Skills are [bracket] tags and perks
  // are {brace} tags — a light CLI-ish structure over the old dot-joined prose.
  const body: string[] = [];

  // Muted domain line, italic so it reads as a subtitle without competing with
  // the bold headline. (Freshness lives in the footer, next to the apply link.)
  if (v.domain) body.push(`<i>${escapeHtml(v.domain.name)}</i>`);

  if (v.skills.required.length > 0) {
    const names = v.skills.required.slice(0, MAX_SKILLS).map((s) => s.name);
    const extra = v.skills.required.length - names.length;
    const tail = extra > 0 ? ` +${extra}` : "";
    const tags = names.map((n) => `[${escapeHtml(n)}]`).join(" ");
    body.push(`${tags}${tail}`);
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
  if (meta) body.push(meta);

  // Perks line, framed the way candidates read them: reservation is a draw
  // (🪖 — deferment from mobilization), and "без тесту" is a plus, so the absence
  // of a test task is surfaced too, not just its presence. Both are bolded to
  // read as perks, dot-joined so they don't blur into the meta line above.
  const perks = joinChips([
    v.hasReservation === true ? "🪖 <b>бронь</b>" : null,
    v.hasTestAssignment === false
      ? "🧪 <b>без тесту</b>"
      : v.hasTestAssignment === true
        ? "🧪 <b>тестове</b>"
        : null,
  ]);
  if (perks) body.push(perks);

  // Footer: apply link + freshness, muted at the end. The link routes through
  // our `/go/:id` redirect (not straight to source) so the tap passes through
  // metahunt and can be tracked later.
  const posted = v.publishedAt ?? v.loadedAt;
  const age = posted ? relativeTime(posted) : null;
  const footer = joinChips([
    v.link
      ? `→ <a href="${escapeHtml(applyUrl(applyBaseUrl, v.id, subscriptionId))}">${escapeHtml(v.source.displayName)}</a>`
      : null,
    age ? `<i>${age}</i>` : null,
  ]);
  if (footer) body.push(footer);

  // Headline = seniority then the clean taxonomy role (the raw scraped title is
  // noisy, so it's dropped). The diamond is the only card marker — monochrome,
  // CLI-ish. Seniority leads since canonical role names never carry a level.
  const role = v.role?.name ?? v.title;
  const seniority = v.seniority ? SENIORITY_LABEL[v.seniority] : null;
  const head = `◆ ${seniority ? `${seniority} · ` : ""}<b>${escapeHtml(role)}</b>`;

  if (body.length === 0) return head;
  return `${head}\n${body.map((line) => `  ${line}`).join("\n")}`;
}

// A dotted rule between cards (the ◆ headline alone read as too cramped in a
// long digest). The header is set off from the first card by a plain blank line.
const CARD_DIVIDER = "┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈";
const CARD_SEPARATOR = `\n${CARD_DIVIDER}\n`;
const HEADER_GAP = "\n\n";

// Paging budget for the scheduled digest. Cap by card count AND a char budget
// well under Telegram's 4096 (the header + separators ride in the remainder).
const MAX_CARDS_PER_MESSAGE = 8;
const MAX_MESSAGE_CHARS = 3500;

export interface DigestMeta {
  /** Total matching vacancies (the "N new" headline count). */
  totalNew: number;
  /** Public origin for building `/go/:id` apply-redirect links. */
  applyBaseUrl: string;
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
  const window = windowDays !== undefined ? ` за ${windowDays} дн` : "";
  const filter = label ? ` · ${escapeHtml(label)}` : "";
  const pager = page && page.count > 1 ? ` (${page.index}/${page.count})` : "";
  return `⌖ <b>${totalNew}</b> нових${window}${filter}${pager}`;
}

/** Render a digest as a single message — headline + one card per vacancy (used by `/preview`). */
export function renderDigest(vacancies: VacancyDto[], meta: DigestMeta): string {
  const header = renderHeader(meta.totalNew, meta);
  if (vacancies.length === 0) return header;
  const cards = vacancies
    .map((v) => renderCard(v, meta.applyBaseUrl, meta.subscriptionId))
    .join(CARD_SEPARATOR);
  return `${header}${HEADER_GAP}${cards}`;
}

/** One Telegram message + the vacancy ids it covers (so the caller records them after a successful send). */
export interface DigestPage {
  html: string;
  vacancyIds: string[];
}

/**
 * Split a digest across Telegram messages, each under the count + char budget,
 * with a per-page header (and `(i/n)` once it spans more than one). Pure: the
 * scheduled engine sends each page and records its `vacancyIds`.
 */
export function paginateDigest(
  vacancies: VacancyDto[],
  meta: DigestMeta,
): DigestPage[] {
  if (vacancies.length === 0) return [];

  const cards = vacancies.map((v) => ({
    id: v.id,
    text: renderCard(v, meta.applyBaseUrl, meta.subscriptionId),
  }));

  // Greedy pack: start a new page when the next card would breach either cap.
  const groups: (typeof cards)[] = [];
  let current: typeof cards = [];
  let chars = 0;
  for (const card of cards) {
    const projected = chars + card.text.length + CARD_SEPARATOR.length;
    const wouldOverflow =
      current.length >= MAX_CARDS_PER_MESSAGE || projected > MAX_MESSAGE_CHARS;
    if (current.length > 0 && wouldOverflow) {
      groups.push(current);
      current = [];
      chars = 0;
    }
    current.push(card);
    chars += card.text.length + CARD_SEPARATOR.length;
  }
  if (current.length > 0) groups.push(current);

  return groups.map((group, index) => {
    const header = renderHeader(meta.totalNew, meta, {
      index: index + 1,
      count: groups.length,
    });
    const body = group.map((c) => c.text).join(CARD_SEPARATOR);
    return {
      html: `${header}${HEADER_GAP}${body}`,
      vacancyIds: group.map((c) => c.id),
    };
  });
}
