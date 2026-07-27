// Where a visit came from, as one display label. Classification lives on the
// server rather than in the browser so a new social app can be recognised
// without shipping a bundle — and so already-stored rows reclassify for free.

// Matched as a suffix of the referring hostname, longest rule first. In-app
// browsers report an Android package name (`com.reddit.frontpage`) instead of a
// domain, so those are listed explicitly.
const REFERRER_RULES: ReadonlyArray<readonly [match: string, channel: string]> = [
  ["threads.com", "threads"],
  ["threads.net", "threads"],
  ["t.me", "telegram"],
  ["telegram.org", "telegram"],
  ["telegram.me", "telegram"],
  ["org.telegram.messenger", "telegram"],
  ["instagram.com", "instagram"],
  ["com.instagram.android", "instagram"],
  ["reddit.com", "reddit"],
  ["com.reddit.frontpage", "reddit"],
  ["google.com", "search"],
  ["google.com.ua", "search"],
  ["bing.com", "search"],
  ["duckduckgo.com", "search"],
  ["yandex.ru", "search"],
  ["facebook.com", "facebook"],
  ["linkedin.com", "linkedin"],
  ["github.com", "github"],
  ["dou.ua", "dou"],
  ["x.com", "x"],
  ["twitter.com", "x"],
];

export const DIRECT_CHANNEL = "direct";

// Hosts that are us. A same-host referrer is internal navigation that lost the
// query string, not acquisition — folding it into `direct` keeps the panel from
// inventing a channel called "metahunt".
const OWN_HOSTS = ["metahunt.app", "metahunt-web.vercel.app", "localhost"];

function matchesHost(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`);
}

/**
 * An explicit tag always wins: a posted link we tagged ourselves is the exact
 * answer, and the referrer is only the fallback for untagged arrivals. An
 * unrecognised domain passes through as itself, so a channel we have never seen
 * shows up as its own row instead of hiding inside `direct`.
 */
export function resolveChannelSource(
  utmSource: string | null,
  referrerDomain: string | null,
): string {
  const utm = utmSource?.trim();
  if (utm) return utm;

  const host = referrerDomain?.trim().toLowerCase();
  if (!host) return DIRECT_CHANNEL;
  if (OWN_HOSTS.some((own) => matchesHost(host, own))) return DIRECT_CHANNEL;

  for (const [match, channel] of REFERRER_RULES) {
    if (matchesHost(host, match)) return channel;
  }
  return host;
}
