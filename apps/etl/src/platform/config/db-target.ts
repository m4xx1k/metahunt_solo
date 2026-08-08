/**
 * Which database a write-capable CLI is about to touch, and whether it is
 * allowed to.
 *
 * Every command in this repo resolves its target the same way —
 * `node --env-file-if-exists=.env` — so the database is a property of the
 * current working directory, not of the command. On 2026-08-08 a worktree
 * `.env` sent a full taxonomy migration into a local restore; it reported
 * success, and nothing in the output named a database (MET-133). The inverse
 * mistake writes to production.
 *
 * So: name the target before acting, and make a remote write need a second word.
 */

// A local restore is the only thing a destructive CLI may touch unattended.
// Host is the honest signal — database names are copied between environments,
// hostnames are not.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "host.docker.internal"]);

export type DbTarget = {
  host: string;
  database: string;
  isLocal: boolean;
  /** `host:port/database` — safe to print, never contains credentials. */
  label: string;
};

/** Thrown when a CLI would write somewhere it was not explicitly told to. */
export class DbTargetRefusal extends Error {}

export function describeDbTarget(rawUrl: string | undefined): DbTarget {
  if (!rawUrl) throw new DbTargetRefusal("DATABASE_URL is not set — refusing to guess a target.");

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new DbTargetRefusal("DATABASE_URL is not a valid URL — refusing to guess a target.");
  }

  const host = parsed.hostname;
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, "")) || "(none)";
  const port = parsed.port || "5432";

  return { host, database, isLocal: LOCAL_HOSTS.has(host), label: `${host}:${port}/${database}` };
}

/**
 * Refuse a write to a non-local database unless the operator said so.
 *
 * Read-only runs (dry-run) pass regardless: pointing a dry-run at prod is how
 * you validate a plan against real data, and it mutates nothing.
 */
export function assertWritableDbTarget(
  target: DbTarget,
  opts: { write: boolean; acknowledged: boolean; flag?: string },
): void {
  if (!opts.write || target.isLocal || opts.acknowledged) return;
  throw new DbTargetRefusal(
    `refusing to write to ${target.label} — it is not a local database.\n` +
      `If that is really the intent, re-run with ${opts.flag ?? "--yes-prod"}.`,
  );
}
