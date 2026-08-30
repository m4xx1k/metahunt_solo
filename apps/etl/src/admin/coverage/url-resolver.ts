import { extractExternalId } from "../../02-enrich/loader/external-id/source-external-id";

// The hosts we ingest, mapped to `sources.code`. This is the one piece the
// ingest-side extractors never needed: RSS already knows which source it is
// reading, a pasted URL does not.
const HOST_SOURCES: Record<string, string> = {
  "jobs.dou.ua": "dou",
  "djinni.co": "djinni",
};

const METAHUNT_HOSTS = new Set(["metahunt.app", "www.metahunt.app", "localhost"]);

// `/vacancy/<role-slug>-<uuid>` — mirrors apps/web/lib/seo/vacancy-url.ts.
const METAHUNT_VACANCY_PATH =
  /\/vacancy\/(?:.*-)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;

const TRACKING_PARAM = /^(utm_|fbclid$|gclid$|ref$|source$)/i;

export type ResolvedUrl =
  | { kind: "metahunt"; postingId: string; normalized: string }
  | { kind: "source"; sourceCode: string; externalId: string; normalized: string }
  | { kind: "unsupported_host"; host: string; normalized: string }
  | { kind: "unparseable"; reason: string };

export function supportedHosts(): string[] {
  return Object.keys(HOST_SOURCES);
}

// The path segment each source's extractExternalId anchors on
// (dou.ts: /vacancies/(\d+), djinni.ts: /jobs/(\d+)).
const ID_PATH_SEGMENT: Record<string, string> = {
  dou: "/vacancies/",
  djinni: "/jobs/",
};

// Pre-57d42ea rows store the WHOLE source URL as external_id
// (md/todo/external-id-duplication-fix.md — ~1k legacy Djinni rows). Exact
// string equality against a freshly normalized URL misses these: the stored
// value carries whatever slash/slug/query the feed had at ingest time, which
// rarely matches byte-for-byte. A LIKE anchored on the id-bearing path segment
// matches regardless.
export function legacyExternalIdLikePattern(sourceCode: string, externalId: string): string | null {
  const segment = ID_PATH_SEGMENT[sourceCode];
  return segment ? `%${segment}${externalId}%` : null;
}

// Collapses the cosmetic variance a human paste carries — scheme, `www.`,
// campaign params, a trailing slash — so two spellings of one vacancy reach
// the same lookup key.
export function normalizeUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // A scheme we do not speak (mailto:, tel:) must fail here: prefixing it with
  // https:// would parse, reading everything before the `@` as credentials.
  const scheme = trimmed.match(/^([a-z][a-z0-9+.-]*):/i);
  if (scheme && !/^https?$/i.test(scheme[1])) return null;

  let url: URL;
  try {
    url = new URL(scheme ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (!url.hostname.includes(".") && url.hostname !== "localhost") return null;

  url.protocol = "https:";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  url.hash = "";
  url.port = "";
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
  }
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");

  return url;
}

export function resolveUrl(raw: string): ResolvedUrl {
  const url = normalizeUrl(raw);
  if (!url) return { kind: "unparseable", reason: "not a URL" };

  const normalized = url.toString();
  const host = url.hostname;

  if (METAHUNT_HOSTS.has(host)) {
    const match = url.pathname.match(METAHUNT_VACANCY_PATH);
    return match
      ? { kind: "metahunt", postingId: match[1].toLowerCase(), normalized }
      : { kind: "unparseable", reason: "metahunt URL without a vacancy id" };
  }

  const sourceCode = HOST_SOURCES[host];
  if (!sourceCode) return { kind: "unsupported_host", host, normalized };

  try {
    // A listing/company/search URL on a source we do ingest reaches the same
    // extractor the RSS loader uses, and fails the same way.
    const externalId = extractExternalId(sourceCode, { link: normalized });
    return { kind: "source", sourceCode, externalId, normalized };
  } catch {
    return { kind: "unparseable", reason: `${sourceCode} URL carries no vacancy id` };
  }
}

// One paste, one line per URL. Blank lines and duplicates are dropped so the
// coverage percentage counts distinct vacancies, not keystrokes.
export function splitInput(input: string): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const line of input.split(/[\r\n]+/)) {
    const trimmed = line.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    lines.push(trimmed);
  }
  return lines;
}
