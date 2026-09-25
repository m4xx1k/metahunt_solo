import { cleanDescription } from "./sanitize";

export interface PostingFacts {
  id: string;
  sourceId: string;
  companyId: string | null;
  title: string;
  titleKey: string;
  titleLevels: string[];
  seniority: string | null;
  roleNodeId: string | null;
  publishedAt: number;
  fingerprint: string | null;
  shingles: Uint32Array;
}

export type MatchRule = "exact" | "repost" | "cross_source";

export interface MatchEvidence {
  rule: MatchRule;
  titleSim: number;
  containment: number;
  cosine: number | null;
}

export type VetoReason =
  "manual_override" | "company" | "requisition" | "seniority" | "role" | "same_source_content";

export interface Thresholds {
  title: number;
  text: number;
  cosine: number;
  cosineStrict: number;
  repostText: number;
}

// Calibrated 2026-09-25 on a blind-labelled 300-pair golden set: the loosest
// values with zero false merges (md/journal/migrations/dedup-rebuild.md#decisions).
export const DEFAULT_THRESHOLDS: Thresholds = {
  title: 0.7,
  text: 0.8,
  cosine: 0.94,
  cosineStrict: 0.95,
  repostText: 0.8,
};

export const LINK_WINDOW_DAYS = 45;
const LINK_WINDOW_MS = LINK_WINDOW_DAYS * 86_400_000;

export interface MatchContext {
  thresholds: Thresholds;
  cosine(a: PostingFacts, b: PostingFacts): number | null;
  isOverridden(a: PostingFacts, b: PostingFacts): boolean;
}

type Veto = (a: PostingFacts, b: PostingFacts, ctx: MatchContext) => VetoReason | null;
type LinkRule = (a: PostingFacts, b: PostingFacts, ctx: MatchContext) => MatchEvidence | null;

// ─────────────────────────── Title ───────────────────────────

const NAMED_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&nbsp;": " ",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&lt;": "<",
  "&gt;": ">",
  "&mdash;": "—",
  "&ndash;": "–",
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&[a-z]+;|&#39;/g, (m) => NAMED_ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));
}

// DOU titles are "<title> в <Company>[, $salary][, locations]"; the company
// itself may contain " в " ("KPMG в Україні"), so a known name wins over the
// last-occurrence fallback.
export function stripBoardSuffix(title: string, companyName: string | null): string {
  const lower = title.toLowerCase();
  if (companyName) {
    const at = lower.lastIndexOf(` в ${companyName.toLowerCase()}`);
    if (at > 0) return title.slice(0, at);
  }
  const at = lower.lastIndexOf(" в ");
  return at > 0 ? title.slice(0, at) : title;
}

const TRAILING_AT_COMPANY = /\s+at\s+[^()]+$/i;

const REQUISITION_REGEX = /\((\d{3,6})\)|#(\d{3,6})(?![\d%])/g;

export function requisitionNo(title: string): string | null {
  for (const m of title.matchAll(REQUISITION_REGEX)) {
    const n = m[1] ?? m[2];
    const asNumber = Number(n);
    if (n.length === 4 && asNumber >= 2020 && asNumber <= 2035) continue;
    return n;
  }
  return null;
}

const STOPWORDS = words(`
  at the a an for to of and with in on or в у для та і й до на з із або remote віддалено
  віддалена hybrid гібрид office офіс fulltime full-time part-time contract kyiv київ lviv
  львів odesa одеса dnipro дніпро kharkiv харків ukraine україна europe eu
`);

const TITLE_LEVELS: Record<string, string> = {
  intern: "INTERN",
  trainee: "INTERN",
  стажер: "INTERN",
  junior: "JUNIOR",
  jr: "JUNIOR",
  джуніор: "JUNIOR",
  молодший: "JUNIOR",
  middle: "MIDDLE",
  mid: "MIDDLE",
  regular: "MIDDLE",
  мідл: "MIDDLE",
  senior: "SENIOR",
  sr: "SENIOR",
  сеньйор: "SENIOR",
  старший: "SENIOR",
  lead: "LEAD",
  провідний: "LEAD",
  principal: "PRINCIPAL",
  staff: "PRINCIPAL",
};
const SENIORITY_MODIFIERS = words("strong");

// Same job, different wording across boards and reposts.
const TITLE_SYNONYMS: Record<string, string> = {
  developer: "engineer",
  dev: "engineer",
  programmer: "engineer",
  розробник: "engineer",
  програміст: "engineer",
  інженер: "engineer",
};

function words(list: string): Set<string> {
  return new Set(list.trim().split(/\s+/));
}

function tokenize(title: string): string[] {
  return title
    .toLowerCase()
    .split(/[^\p{L}\p{N}+#.]+/u)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => t.length > 0);
}

function cleanTitle(
  rawTitle: string,
  sourceCode: string | null,
  companyName: string | null,
): string {
  let title = decodeEntities(rawTitle);
  if (sourceCode === "dou") title = stripBoardSuffix(title, companyName);
  return title.replace(TRAILING_AT_COMPANY, "").replace(REQUISITION_REGEX, " ");
}

/**
 * Sorted unique identity tokens of a title. Board suffix, noise, requisition
 * numbers, the company's own name and seniority words are removed — seniority
 * is compared separately, by `titleLevels` and the extracted field.
 */
export function titleKey(
  rawTitle: string,
  opts: { sourceCode: string | null; companyName: string | null },
): string {
  const companyTokens = new Set(opts.companyName ? tokenize(decodeEntities(opts.companyName)) : []);
  const tokens = tokenize(cleanTitle(rawTitle, opts.sourceCode, opts.companyName))
    .filter(
      (t) =>
        !STOPWORDS.has(t) &&
        !companyTokens.has(t) &&
        !(t in TITLE_LEVELS) &&
        !SENIORITY_MODIFIERS.has(t),
    )
    .map((t) => TITLE_SYNONYMS[t] ?? t);
  return [...new Set(tokens)].sort().join(" ");
}

/** Seniority levels named in a title ("Middle/Senior" → MIDDLE, SENIOR). */
export function titleLevels(rawTitle: string): string[] {
  const levels = tokenize(decodeEntities(rawTitle))
    .map((t) => TITLE_LEVELS[t])
    .filter((l): l is string => l !== undefined);
  return [...new Set(levels)].sort();
}

export function titleSim(keyA: string, keyB: string): number {
  const a = new Set(keyA.split(" ").filter(Boolean));
  const b = new Set(keyB.split(" ").filter(Boolean));
  if (a.size === 0 || b.size === 0) return 0;
  let common = 0;
  for (const t of a) if (b.has(t)) common++;
  return common / (a.size + b.size - common);
}

// ───────────────────────── Description ─────────────────────────

const SHINGLE_WORDS = 5;

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Sorted unique hashes of 5-word shingles over the cleaned description. */
export function shingles(description: string | null): Uint32Array {
  const words = cleanDescription(description)
    .toLowerCase()
    .split(/[^\p{L}\p{N}+#]+/u)
    .filter((w) => w.length > 0);
  const hashes = new Set<number>();
  for (let i = 0; i + SHINGLE_WORDS <= words.length; i++) {
    hashes.add(fnv1a(words.slice(i, i + SHINGLE_WORDS).join(" ")));
  }
  return Uint32Array.from(hashes).sort();
}

export function containment(a: Uint32Array, b: Uint32Array): number {
  if (a.length === 0 || b.length === 0) return 0;
  let i = 0;
  let j = 0;
  let common = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      common++;
      i++;
      j++;
    } else if (a[i] < b[j]) i++;
    else j++;
  }
  return common / Math.min(a.length, b.length);
}

// ──────────────────────────── Rules ────────────────────────────

function bothKnownAndDiffer<T>(a: T | null, b: T | null): boolean {
  return a !== null && b !== null && a !== b;
}

function disjointLevels(a: readonly string[], b: readonly string[]): boolean {
  return a.length > 0 && b.length > 0 && !a.some((l) => b.includes(l));
}

export function isRepost(a: PostingFacts, b: PostingFacts, ctx: MatchContext): boolean {
  return (
    a.sourceId === b.sourceId &&
    a.companyId === b.companyId &&
    a.titleKey === b.titleKey &&
    containment(a.shingles, b.shingles) >= ctx.thresholds.repostText
  );
}

export const VETOES: readonly Veto[] = [
  (a, b, ctx) => (ctx.isOverridden(a, b) ? "manual_override" : null),
  (a, b) => (bothKnownAndDiffer(a.companyId, b.companyId) ? "company" : null),
  (a, b) =>
    bothKnownAndDiffer(requisitionNo(a.title), requisitionNo(b.title)) ? "requisition" : null,
  (a, b) =>
    bothKnownAndDiffer(a.seniority, b.seniority) || disjointLevels(a.titleLevels, b.titleLevels)
      ? "seniority"
      : null,
  (a, b) => (bothKnownAndDiffer(a.roleNodeId, b.roleNodeId) ? "role" : null),
  (a, b, ctx) =>
    a.sourceId === b.sourceId && a.fingerprint !== b.fingerprint && !isRepost(a, b, ctx)
      ? "same_source_content"
      : null,
];

function evidence(
  rule: MatchRule,
  a: PostingFacts,
  b: PostingFacts,
  ctx: MatchContext,
): MatchEvidence {
  return {
    rule,
    titleSim: round3(titleSim(a.titleKey, b.titleKey)),
    containment: round3(containment(a.shingles, b.shingles)),
    cosine: roundOrNull(ctx.cosine(a, b)),
  };
}

export const LINK_RULES: readonly LinkRule[] = [
  (a, b, ctx) =>
    a.fingerprint !== null && a.fingerprint === b.fingerprint ? evidence("exact", a, b, ctx) : null,
  (a, b, ctx) => (isRepost(a, b, ctx) ? evidence("repost", a, b, ctx) : null),
  (a, b, ctx) => {
    if (a.sourceId === b.sourceId) return null;
    const t = ctx.thresholds;
    const strict = a.companyId === null || b.companyId === null;
    const titleOk = strict
      ? a.titleKey === b.titleKey
      : titleSim(a.titleKey, b.titleKey) >= t.title;
    if (!titleOk) return null;
    const cos = ctx.cosine(a, b);
    const textOk =
      containment(a.shingles, b.shingles) >= t.text ||
      (cos !== null && cos >= (strict ? t.cosineStrict : t.cosine));
    return textOk ? evidence("cross_source", a, b, ctx) : null;
  },
];

export function vetoes(a: PostingFacts, b: PostingFacts, ctx: MatchContext): VetoReason | null {
  for (const veto of VETOES) {
    const reason = veto(a, b, ctx);
    if (reason) return reason;
  }
  return null;
}

/** Positive link; only meaningful when `vetoes(a, b)` is null. */
export function isSame(a: PostingFacts, b: PostingFacts, ctx: MatchContext): MatchEvidence | null {
  if (Math.abs(a.publishedAt - b.publishedAt) > LINK_WINDOW_MS) return null;
  for (const rule of LINK_RULES) {
    const hit = rule(a, b, ctx);
    if (hit) return hit;
  }
  return null;
}

export function cosineOf(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function roundOrNull(n: number | null): number | null {
  return n === null ? null : round3(n);
}
