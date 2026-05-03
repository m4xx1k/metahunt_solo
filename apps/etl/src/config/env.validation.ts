type RawEnv = Record<string, unknown>;

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`PORT must be an integer in range 1..65535, got "${value}"`);
  }
  return parsed;
}

function parseIntInRange(
  name: string,
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(
      `${name} must be an integer in range ${min}..${max}, got "${value}"`,
    );
  }
  return parsed;
}

function assertPostgresUrl(name: string, value: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL, got "${value}"`);
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error(`${name} must start with postgres:// or postgresql://`);
  }
}

function assertUrl(name: string, value: string): void {
  try {
    new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL, got "${value}"`);
  }
}

export function validateEnv(config: RawEnv): RawEnv {
  const nodeEnv = asString(config.NODE_ENV) ?? "development";
  if (!["development", "test", "production", "local"].includes(nodeEnv)) {
    throw new Error(
      `NODE_ENV must be one of development|test|production|local, got "${nodeEnv}"`,
    );
  }

  const port = parsePort(asString(config.PORT), 3000);

  const databaseUrl = asString(config.DATABASE_URL);
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  assertPostgresUrl("DATABASE_URL", databaseUrl);

  // NODE_ENV=local forces the Temporal client to the docker-compose stack regardless
  // of TEMPORAL_* values in .env. Lets Cloud creds stay in .env without bleeding into
  // local dev (which would split-brain workflows between local and Cloud workers).
  const isLocal = nodeEnv === "local";
  const temporalAddress = isLocal
    ? "localhost:7233"
    : asString(config.TEMPORAL_ADDRESS) ?? "localhost:7233";
  const temporalNamespace = isLocal
    ? "default"
    : asString(config.TEMPORAL_NAMESPACE) ?? "default";
  const temporalTaskQueue = asString(config.TEMPORAL_TASK_QUEUE) ?? "rss-ingest";
  // Temporal Cloud uses API-key auth (newer mode) — when set we enable TLS automatically.
  // Empty string means "local plaintext mode" (matches the default `localhost:7233`).
  const temporalApiKey = isLocal ? "" : asString(config.TEMPORAL_API_KEY) ?? "";

  // Hourly RSS ingest schedule cadence (within the 06:00–22:00 Europe/Kyiv window).
  // 1..16 keeps at least two firings/day inside the window (start=6, end=22).
  const rssIngestIntervalHours = parseIntInRange(
    "RSS_INGEST_INTERVAL_HOURS",
    asString(config.RSS_INGEST_INTERVAL_HOURS),
    1,
    1,
    16,
  );

  const storageEndpoint =
    asString(config.STORAGE_ENDPOINT) ?? "http://localhost:9000";
  const storageBucket = asString(config.STORAGE_BUCKET) ?? "rss-payloads";
  const storageAccessKey = asString(config.STORAGE_ACCESS_KEY) ?? "metahunt";
  const storageSecretKey = asString(config.STORAGE_SECRET_KEY) ?? "metahunt123";
  const storageRegion = asString(config.STORAGE_REGION) ?? "us-east-1";
  assertUrl("STORAGE_ENDPOINT", storageEndpoint);

  const openaiApiKey = asString(config.OPENAI_API_KEY) ?? "";
  const openaiModel = asString(config.OPENAI_MODEL) ?? "gpt-4o-mini";

  const validProviders = ["baml", "placeholder"] as const;
  const rawProvider =
    asString(config.EXTRACTOR_PROVIDER) ?? "placeholder";
  if (!(validProviders as readonly string[]).includes(rawProvider)) {
    throw new Error(
      `EXTRACTOR_PROVIDER must be one of ${validProviders.join("|")}, got "${rawProvider}"`,
    );
  }
  const extractorProvider = rawProvider as (typeof validProviders)[number];

  if (extractorProvider === "baml" && openaiApiKey.length === 0) {
    throw new Error(
      "OPENAI_API_KEY is required when EXTRACTOR_PROVIDER=baml " +
        "(BAML routes through the OpenAI client by default)",
    );
  }

  return {
    ...config,
    NODE_ENV: nodeEnv,
    PORT: port,
    DATABASE_URL: databaseUrl,
    TEMPORAL_ADDRESS: temporalAddress,
    TEMPORAL_NAMESPACE: temporalNamespace,
    TEMPORAL_TASK_QUEUE: temporalTaskQueue,
    TEMPORAL_API_KEY: temporalApiKey,
    RSS_INGEST_INTERVAL_HOURS: rssIngestIntervalHours,
    STORAGE_ENDPOINT: storageEndpoint,
    STORAGE_BUCKET: storageBucket,
    STORAGE_ACCESS_KEY: storageAccessKey,
    STORAGE_SECRET_KEY: storageSecretKey,
    STORAGE_REGION: storageRegion,
    OPENAI_API_KEY: openaiApiKey,
    OPENAI_MODEL: openaiModel,
    EXTRACTOR_PROVIDER: extractorProvider,
  };
}
