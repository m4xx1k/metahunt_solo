import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

const QUERY_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 60_000;

export type PostHogQueryRow = Record<string, unknown>;

interface PostHogQueryResponse {
  results?: unknown[][];
  columns?: string[];
}

interface CacheEntry {
  rows: PostHogQueryRow[];
  expiresAt: number;
}

// PostHog returns positional rows; callers must not depend on column order.
export function mapPostHogRows(response: PostHogQueryResponse): PostHogQueryRow[] {
  const columns = response.columns ?? [];
  const results = Array.isArray(response.results) ? response.results : [];
  return results.map((row) => {
    const mapped: PostHogQueryRow = {};
    columns.forEach((column, index) => {
      mapped[column] = row[index];
    });
    return mapped;
  });
}

// Query failures degrade the dashboard instead of reaching the request path.
@Injectable()
export class PostHogQueryClient {
  private readonly logger = new Logger(PostHogQueryClient.name);
  private readonly personalApiKey: string;
  private readonly privateHost: string;
  private readonly projectId: string;
  private readonly configured: boolean;
  private readonly cache = new Map<string, CacheEntry>();

  // Overridable in tests so cache-TTL assertions don't need real sleeps.
  clock: () => number = () => Date.now();

  constructor(config: ConfigService) {
    this.personalApiKey = config.get<string>("POSTHOG_PERSONAL_API_KEY") ?? "";
    this.privateHost = config.get<string>("POSTHOG_PRIVATE_HOST") ?? "";
    this.projectId = config.get<string>("POSTHOG_PROD_PROJECT_ID") ?? "";
    this.configured = this.validateConfig();
  }

  // Mirrors scripts/posthog-founder-setup.ts's checks (phx_ prefix, private
  // host is not the ingest host) but logs + degrades instead of throwing —
  // this runs inside a live request path, not a one-shot CLI script.
  private validateConfig(): boolean {
    if (
      this.personalApiKey.length === 0 ||
      this.privateHost.length === 0 ||
      this.projectId.length === 0
    ) {
      return false;
    }
    if (!this.personalApiKey.startsWith("phx_")) {
      this.logger.warn(
        "POSTHOG_PERSONAL_API_KEY must be a phx_ personal API key — analytics-page query client dormant.",
      );
      return false;
    }
    if (this.privateHost.includes(".i.posthog.com")) {
      this.logger.warn(
        "POSTHOG_PRIVATE_HOST looks like the ingest host, not the private query host — analytics-page query client dormant.",
      );
      return false;
    }
    return true;
  }

  isAvailable(): boolean {
    return this.configured;
  }

  async query(hogql: string): Promise<PostHogQueryRow[] | null> {
    if (!this.configured) return null;

    const cached = this.cache.get(hogql);
    if (cached && cached.expiresAt > this.clock()) {
      return cached.rows;
    }

    let response: Response;
    try {
      response = await fetch(`${this.privateHost}/api/projects/${this.projectId}/query/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.personalApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: { kind: "HogQLQuery", query: hogql } }),
        signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.warn(
        `PostHog query failed (timeout or network error): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      this.logger.warn(`PostHog query returned ${response.status}: ${body.slice(0, 500)}`);
      return null;
    }

    let json: PostHogQueryResponse;
    try {
      json = (await response.json()) as PostHogQueryResponse;
    } catch (error) {
      this.logger.warn(
        `PostHog query returned a non-JSON 2xx body: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }

    const rows = mapPostHogRows(json);
    this.cache.set(hogql, { rows, expiresAt: this.clock() + CACHE_TTL_MS });
    return rows;
  }
}
