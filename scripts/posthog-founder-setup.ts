import "dotenv/config";

const PROD_PROJECT_NAME = "MetaHunt — PROD";
const LOCAL_PROJECT_NAME = "MetaHunt — LOCAL / DEV";
const DASHBOARD_NAME = "Founder — acquisition and activation";
const ACTION_NAME = "vacancy_outbound_any";
const KYIV_TIMEZONE = "Europe/Kyiv";

type Mode = "plan" | "verify" | "apply";

interface Config {
  mode: Mode;
  host: string;
  token: string | null;
  organizationId: string | null;
  prodProjectId: string | null;
  localProjectId: string | null;
}

type ConfiguredConfig = Config & {
  token: string;
  organizationId: string;
  prodProjectId: string;
  localProjectId: string;
};

interface ListResponse<T> {
  results: T[];
}

interface Project {
  id: number;
  name: string;
  timezone: string;
}

interface Action {
  id: number;
  name: string | null;
  deleted?: boolean;
}

interface Dashboard {
  id: number;
  name: string | null;
  description?: string | null;
  deleted?: boolean;
}

interface Insight {
  id: number;
  name: string | null;
  deleted?: boolean;
  dashboards?: unknown;
}

interface FounderInsight {
  name: string;
  description: string;
  query: string;
}

interface QueryResponse {
  results?: unknown[];
}

const FOUNDER_INSIGHTS: FounderInsight[] = [
  {
    name: "MET-114 — live visitors and page views",
    description: "Unique visitors and route-classified page views over the last 24 hours.",
    query: `
      SELECT
        coalesce(toString(properties.page_type), 'unknown') AS page_type,
        count(DISTINCT distinct_id) AS unique_visitors,
        count() AS page_views
      FROM events
      WHERE event = 'page_viewed'
        AND coalesce(toString(properties.is_test), 'false') != 'true'
        AND timestamp >= now() - INTERVAL 24 HOUR
      GROUP BY page_type
      ORDER BY page_views DESC
    `,
  },
  {
    name: "MET-114 — entry paths after talks",
    description: "Entry paths for the last 7 days; use with talk annotations and UTM campaigns.",
    query: `
      SELECT
        coalesce(toString(properties.path), toString(properties.$pathname), toString(properties.$current_url), 'unknown') AS entry_path,
        count(DISTINCT distinct_id) AS visitors,
        min(timestamp) AS first_seen_at
      FROM events
      WHERE event = 'page_viewed'
        AND coalesce(toString(properties.is_test), 'false') != 'true'
        AND timestamp >= now() - INTERVAL 7 DAY
      GROUP BY entry_path
      ORDER BY visitors DESC
      LIMIT 25
    `,
  },
  {
    name: "MET-114 — first-touch source and campaign",
    description: "Bounded acquisition dimensions for the current founder campaign window.",
    query: `
      SELECT
        coalesce(toString(properties.utm_source), 'direct_or_unknown') AS source,
        coalesce(toString(properties.utm_campaign), 'none') AS campaign,
        coalesce(toString(properties.referrer_domain), 'none') AS referrer_domain,
        coalesce(toString(properties.$geoip_country_name), 'unknown') AS country,
        coalesce(toString(properties.$device_type), 'unknown') AS device,
        count(DISTINCT distinct_id) AS visitors
      FROM events
      WHERE event = 'page_viewed'
        AND coalesce(toString(properties.is_test), 'false') != 'true'
        AND timestamp >= now() - INTERVAL 30 DAY
      GROUP BY source, campaign, referrer_domain, country, device
      ORDER BY visitors DESC
      LIMIT 50
    `,
  },
  {
    name: "MET-114 — vacancy outbound by surface",
    description: "Feed vs Telegram digest outbound clicks on the normalized event.",
    query: `
      SELECT
        coalesce(toString(properties.surface), 'unknown') AS surface,
        count() AS clicks,
        count(DISTINCT distinct_id) AS people
      FROM events
      WHERE event = 'vacancy_outbound_clicked'
        AND coalesce(toString(properties.is_test), 'false') != 'true'
        AND timestamp >= now() - INTERVAL 30 DAY
      GROUP BY surface
      ORDER BY clicks DESC
    `,
  },
  {
    name: "MET-114 — Telegram radar funnel",
    description: "Landing to CTA to subscription to Telegram link; one row per funnel step.",
    query: `
      WITH steps AS (
        SELECT '01 page_viewed' AS step, count(DISTINCT distinct_id) AS people
        FROM events
        WHERE event = 'page_viewed'
          AND coalesce(toString(properties.is_test), 'false') != 'true'
          AND timestamp >= now() - INTERVAL 30 DAY
        UNION ALL
        SELECT '02 landing_cta_clicked', count(DISTINCT distinct_id)
        FROM events
        WHERE event = 'landing_cta_clicked'
          AND coalesce(toString(properties.is_test), 'false') != 'true'
          AND timestamp >= now() - INTERVAL 30 DAY
        UNION ALL
        SELECT '03 subscription_created', count(DISTINCT distinct_id)
        FROM events
        WHERE event = 'subscription_created'
          AND coalesce(toString(properties.is_test), 'false') != 'true'
          AND timestamp >= now() - INTERVAL 30 DAY
        UNION ALL
        SELECT '04 telegram_linked', count(DISTINCT distinct_id)
        FROM events
        WHERE event = 'telegram_linked'
          AND coalesce(toString(properties.is_test), 'false') != 'true'
          AND timestamp >= now() - INTERVAL 30 DAY
      )
      SELECT step, people
      FROM steps
      ORDER BY step
    `,
  },
  {
    name: "MET-114 — vacancy click funnel",
    description: "Page views to normalized outbound clicks, split by source surface.",
    query: `
      SELECT
        '01 page_viewed' AS step,
        'all' AS surface,
        count(DISTINCT distinct_id) AS people
      FROM events
      WHERE event = 'page_viewed'
        AND coalesce(toString(properties.is_test), 'false') != 'true'
        AND timestamp >= now() - INTERVAL 30 DAY
      UNION ALL
      SELECT
        '02 vacancy_outbound_clicked' AS step,
        coalesce(toString(properties.surface), 'unknown') AS surface,
        count(DISTINCT distinct_id) AS people
      FROM events
      WHERE event = 'vacancy_outbound_clicked'
        AND coalesce(toString(properties.is_test), 'false') != 'true'
        AND timestamp >= now() - INTERVAL 30 DAY
      GROUP BY surface
      ORDER BY step, surface
    `,
  },
  {
    name: "MET-114 — CV match onboarding",
    description: "CV/match lifecycle events for the warm lens.",
    query: `
      SELECT
        event,
        count() AS events,
        count(DISTINCT distinct_id) AS people
      FROM events
      WHERE event IN ('cv_upload_started', 'cv_upload_completed', 'cv_upload_failed', 'match_flow_started', 'match_scored', 'match_flow_completed')
        AND coalesce(toString(properties.is_test), 'false') != 'true'
        AND timestamp >= now() - INTERVAL 30 DAY
      GROUP BY event
      ORDER BY events DESC
    `,
  },
  {
    name: "MET-114 — auth funnel",
    description: "Authentication and provider-linking lifecycle events.",
    query: `
      SELECT
        event,
        count() AS events,
        count(DISTINCT distinct_id) AS people
      FROM events
      WHERE event IN ('telegram_login_started', 'telegram_login_cancelled', 'telegram_login_failed', 'google_login_failed', 'identity_linked', 'identity_unlinked', 'identity_link_conflict', 'logged_in', 'signup')
        AND coalesce(toString(properties.is_test), 'false') != 'true'
        AND timestamp >= now() - INTERVAL 30 DAY
      GROUP BY event
      ORDER BY events DESC
    `,
  },
  {
    name: "MET-114 — recent activity",
    description:
      "Recent production activity across activation, outbound, auth, and subscription events.",
    query: `
      SELECT
        timestamp,
        event,
        distinct_id,
        properties.surface AS surface,
        properties.page_type AS page_type
      FROM events
      WHERE event IN ('page_viewed', 'vacancy_outbound_clicked', 'telegram_linked', 'subscription_created', 'unsubscribed', 'identity_linked', 'identity_link_conflict', 'logged_in', 'signup')
        AND coalesce(toString(properties.is_test), 'false') != 'true'
      ORDER BY timestamp DESC
      LIMIT 100
    `,
  },
];

function readMode(): Mode {
  const args = new Set(process.argv.slice(2));
  if (args.has("--apply")) return "apply";
  if (args.has("--verify")) return "verify";
  return "plan";
}

function privateHost(): string {
  const explicit = process.env.POSTHOG_PRIVATE_HOST?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const ingestion = process.env.POSTHOG_HOST?.trim() ?? "https://eu.i.posthog.com";
  return ingestion
    .replace("://eu.i.posthog.com", "://eu.posthog.com")
    .replace("://us.i.posthog.com", "://us.posthog.com")
    .replace(/\/$/, "");
}

function config(): Config {
  return {
    mode: readMode(),
    host: privateHost(),
    token: process.env.POSTHOG_PERSONAL_API_KEY?.trim() ?? null,
    organizationId: process.env.POSTHOG_ORGANIZATION_ID?.trim() ?? null,
    prodProjectId: process.env.POSTHOG_PROD_PROJECT_ID?.trim() ?? null,
    localProjectId: process.env.POSTHOG_LOCAL_PROJECT_ID?.trim() ?? null,
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isNumericId(value: string): boolean {
  return /^[1-9][0-9]*$/.test(value);
}

function assertConfigured(cfg: Config): asserts cfg is ConfiguredConfig {
  if (cfg.mode === "plan") return;
  const missing = [
    ["POSTHOG_PERSONAL_API_KEY", cfg.token],
    ["POSTHOG_ORGANIZATION_ID", cfg.organizationId],
    ["POSTHOG_PROD_PROJECT_ID", cfg.prodProjectId],
    ["POSTHOG_LOCAL_PROJECT_ID", cfg.localProjectId],
  ].flatMap(([name, value]) => (value ? [] : [name]));

  if (missing.length > 0) {
    throw new Error(`Missing env for ${cfg.mode}: ${missing.join(", ")}`);
  }
  if (!cfg.token?.startsWith("phx_")) {
    throw new Error("POSTHOG_PERSONAL_API_KEY must be a phx_ personal API key");
  }
  if (cfg.host.includes(".i.posthog.com")) {
    throw new Error(
      "POSTHOG_PRIVATE_HOST must be a private API host, for example https://eu.posthog.com",
    );
  }
  if (cfg.organizationId && !isUuid(cfg.organizationId)) {
    throw new Error("POSTHOG_ORGANIZATION_ID must be a UUID");
  }
  if (cfg.prodProjectId && !isNumericId(cfg.prodProjectId)) {
    throw new Error("POSTHOG_PROD_PROJECT_ID must be a numeric PostHog project id");
  }
  if (cfg.localProjectId && !isNumericId(cfg.localProjectId)) {
    throw new Error("POSTHOG_LOCAL_PROJECT_ID must be a numeric PostHog project id");
  }
}

function dashboardDescription(): string {
  return [
    "MET-114 founder dashboard. Global reading rule: exclude `is_test=true`; timezone Europe/Kyiv.",
    "",
    "Required cards:",
    "- Live unique visitors and `page_viewed`, split by `page_type`.",
    "- Entry paths from `page_viewed` after public talks.",
    "- First-touch `utm_source`, `utm_campaign`, `referrer_domain`, country, device.",
    "- Recent activity: `page_viewed`, `vacancy_outbound_clicked`, auth, subscription lifecycle.",
    "",
    "Required funnels:",
    "- `page_viewed -> landing_cta_clicked -> subscription_created -> telegram_linked`.",
    "- `page_viewed -> vacancy_outbound_clicked`, broken down by `surface`.",
    "- CV match onboarding.",
    "- Auth.",
    "",
    "Meetup rule: spoken links without UTM are inferred time cohorts, not proven sources.",
  ].join("\n");
}

function actionPayload(): Record<string, unknown> {
  return {
    name: ACTION_NAME,
    description:
      "Transition action for vacancy outbound history across legacy and normalized events.",
    tags: ["met-114", "founder"],
    steps: [
      { event: "apply_clicked", properties: [] },
      { event: "digest_link_clicked", properties: [] },
      { event: "vacancy_outbound_clicked", properties: [] },
    ],
  };
}

function dashboardIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "number") return [item];
    if (typeof item !== "object" || item === null) return [];
    const id = (item as Record<string, unknown>).id;
    return typeof id === "number" ? [id] : [];
  });
}

function includesDashboard(insight: Insight, dashboardId: number): boolean {
  return dashboardIds(insight.dashboards).includes(dashboardId);
}

async function api<T>(cfg: Config, method: string, path: string, body?: unknown): Promise<T> {
  if (!cfg.token) throw new Error("POSTHOG_PERSONAL_API_KEY is required");
  const response = await fetch(`${cfg.host}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path} failed: ${response.status} ${text.slice(0, 300)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

async function setProject(cfg: ConfiguredConfig, id: string, name: string): Promise<void> {
  if (cfg.mode === "apply") {
    await api<Project>(cfg, "PATCH", `/api/organizations/${cfg.organizationId}/projects/${id}/`, {
      name,
      timezone: KYIV_TIMEZONE,
    });
  }
  const project = await api<Project>(
    cfg,
    "GET",
    `/api/organizations/${cfg.organizationId}/projects/${id}/`,
  );
  if (project.name !== name || project.timezone !== KYIV_TIMEZONE) {
    throw new Error(
      `Project ${id} mismatch: got "${project.name}" / "${project.timezone}", expected "${name}" / "${KYIV_TIMEZONE}"`,
    );
  }
  console.log(`ok project ${id}: ${name}, ${KYIV_TIMEZONE}`);
}

async function ensureAction(cfg: ConfiguredConfig): Promise<void> {
  const params = new URLSearchParams({ search: ACTION_NAME });
  const listed = await api<ListResponse<Action>>(
    cfg,
    "GET",
    `/api/projects/${cfg.prodProjectId}/actions/?${params}`,
  );
  const existing = listed.results.find((action) => action.name === ACTION_NAME && !action.deleted);

  if (cfg.mode === "apply") {
    if (existing) {
      await api<Action>(
        cfg,
        "PATCH",
        `/api/projects/${cfg.prodProjectId}/actions/${existing.id}/`,
        actionPayload(),
      );
    } else {
      await api<Action>(
        cfg,
        "POST",
        `/api/projects/${cfg.prodProjectId}/actions/`,
        actionPayload(),
      );
    }
  }

  const checked = await api<ListResponse<Action>>(
    cfg,
    "GET",
    `/api/projects/${cfg.prodProjectId}/actions/?${params}`,
  );
  if (!checked.results.some((action) => action.name === ACTION_NAME && !action.deleted)) {
    throw new Error(`Missing PostHog action: ${ACTION_NAME}`);
  }
  console.log(`ok action: ${ACTION_NAME}`);
}

function insightPayload(insight: FounderInsight, dashboardId: number): Record<string, unknown> {
  return {
    name: insight.name,
    description: insight.description,
    dashboards: [dashboardId],
    tags: ["met-114", "founder"],
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "HogQLQuery",
        query: insight.query.trim(),
      },
    },
  };
}

async function ensureDashboard(cfg: ConfiguredConfig): Promise<number> {
  const params = new URLSearchParams({ search: DASHBOARD_NAME });
  const listed = await api<ListResponse<Dashboard>>(
    cfg,
    "GET",
    `/api/projects/${cfg.prodProjectId}/dashboards/?${params}`,
  );
  const existing = listed.results.find(
    (dashboard) => dashboard.name === DASHBOARD_NAME && !dashboard.deleted,
  );

  if (cfg.mode === "apply") {
    const payload = {
      name: DASHBOARD_NAME,
      description: dashboardDescription(),
      pinned: true,
      tags: ["met-114", "founder"],
    };
    if (existing) {
      await api<Dashboard>(
        cfg,
        "PATCH",
        `/api/projects/${cfg.prodProjectId}/dashboards/${existing.id}/`,
        payload,
      );
    } else {
      await api<Dashboard>(cfg, "POST", `/api/projects/${cfg.prodProjectId}/dashboards/`, payload);
    }
  }

  const checked = await api<ListResponse<Dashboard>>(
    cfg,
    "GET",
    `/api/projects/${cfg.prodProjectId}/dashboards/?${params}`,
  );
  if (
    !checked.results.some((dashboard) => dashboard.name === DASHBOARD_NAME && !dashboard.deleted)
  ) {
    throw new Error(`Missing PostHog dashboard: ${DASHBOARD_NAME}`);
  }
  const dashboard = checked.results.find(
    (candidate) => candidate.name === DASHBOARD_NAME && !candidate.deleted,
  );
  if (!dashboard) throw new Error(`Missing PostHog dashboard: ${DASHBOARD_NAME}`);
  console.log(`ok dashboard: ${DASHBOARD_NAME}`);
  return dashboard.id;
}

async function ensureInsights(cfg: ConfiguredConfig, dashboardId: number): Promise<void> {
  for (const insight of FOUNDER_INSIGHTS) {
    const params = new URLSearchParams({ include_dashboards: "true", search: insight.name });
    const listed = await api<ListResponse<Insight>>(
      cfg,
      "GET",
      `/api/projects/${cfg.prodProjectId}/insights/?${params}`,
    );
    const existing = listed.results.find((item) => item.name === insight.name && !item.deleted);

    if (cfg.mode === "apply") {
      const payload = insightPayload(insight, dashboardId);
      if (existing) {
        await api<Insight>(
          cfg,
          "PATCH",
          `/api/projects/${cfg.prodProjectId}/insights/${existing.id}/`,
          payload,
        );
      } else {
        await api<Insight>(cfg, "POST", `/api/projects/${cfg.prodProjectId}/insights/`, payload);
      }
    }

    const checked = await api<ListResponse<Insight>>(
      cfg,
      "GET",
      `/api/projects/${cfg.prodProjectId}/insights/?${params}`,
    );
    const saved = checked.results.find((item) => item.name === insight.name && !item.deleted);
    if (!saved) {
      throw new Error(`Missing PostHog insight: ${insight.name}`);
    }
    const detailParams = new URLSearchParams({ include_dashboards: "true" });
    const detailed = await api<Insight>(
      cfg,
      "GET",
      `/api/projects/${cfg.prodProjectId}/insights/${saved.id}/?${detailParams}`,
    );
    if (!includesDashboard(detailed, dashboardId)) {
      throw new Error(`PostHog insight is not attached to ${DASHBOARD_NAME}: ${insight.name}`);
    }
    console.log(`ok dashboard insight: ${insight.name}`);
  }
}

async function verifyEvents(cfg: ConfiguredConfig): Promise<void> {
  const query = `
    SELECT event, count() AS events
    FROM events
    WHERE event IN ('page_viewed', 'vacancy_outbound_clicked', 'telegram_linked')
      AND coalesce(toString(properties.is_test), 'false') != 'true'
      AND timestamp >= now() - INTERVAL 30 DAY
    GROUP BY event
    ORDER BY event
  `;
  await api<QueryResponse>(cfg, "POST", `/api/projects/${cfg.prodProjectId}/query/`, {
    name: "met-114 founder setup smoke",
    query: { kind: "HogQLQuery", query },
  });
  console.log("ok query auth: production events can be queried with is_test excluded");
}

function printPlan(cfg: Config): void {
  console.log(`PostHog private host: ${cfg.host}`);
  console.log("Required env for --apply/--verify:");
  console.log(
    "  POSTHOG_PERSONAL_API_KEY=phx_... with project/action/dashboard/insight/query scopes",
  );
  console.log("  POSTHOG_ORGANIZATION_ID=<org uuid>");
  console.log("  POSTHOG_PROD_PROJECT_ID=<numeric project id>");
  console.log("  POSTHOG_LOCAL_PROJECT_ID=<numeric project id>");
  console.log("");
  console.log("Apply will:");
  console.log(`  rename PROD project to "${PROD_PROJECT_NAME}" and set ${KYIV_TIMEZONE}`);
  console.log(`  rename LOCAL project to "${LOCAL_PROJECT_NAME}" and set ${KYIV_TIMEZONE}`);
  console.log(`  create/update action "${ACTION_NAME}" in PROD`);
  console.log(`  create/update dashboard "${DASHBOARD_NAME}" in PROD`);
  console.log(`  create/update ${FOUNDER_INSIGHTS.length} saved founder insights in PROD`);
}

async function main(): Promise<void> {
  const cfg = config();
  if (cfg.mode === "plan") {
    printPlan(cfg);
    return;
  }

  assertConfigured(cfg);
  await setProject(cfg, cfg.prodProjectId, PROD_PROJECT_NAME);
  await setProject(cfg, cfg.localProjectId, LOCAL_PROJECT_NAME);
  await ensureAction(cfg);
  const dashboardId = await ensureDashboard(cfg);
  await ensureInsights(cfg, dashboardId);
  await verifyEvents(cfg);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
