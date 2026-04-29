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

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  const normalized = value.toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`Expected boolean string "true" or "false", got "${value}"`);
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
  if (!["development", "test", "production"].includes(nodeEnv)) {
    throw new Error(
      `NODE_ENV must be one of development|test|production, got "${nodeEnv}"`,
    );
  }

  const port = parsePort(asString(config.PORT), 3000);

  const databaseUrl = asString(config.DATABASE_URL);
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  assertPostgresUrl("DATABASE_URL", databaseUrl);

  const temporalAddress = asString(config.TEMPORAL_ADDRESS) ?? "localhost:7233";
  const temporalNamespace = asString(config.TEMPORAL_NAMESPACE) ?? "default";
  const temporalTaskQueue = asString(config.TEMPORAL_TASK_QUEUE) ?? "rss-ingest";
  // Temporal Cloud uses API-key auth (newer mode) — when set we enable TLS automatically.
  // Empty string means "local plaintext mode" (matches the default `localhost:7233`).
  const temporalApiKey = asString(config.TEMPORAL_API_KEY) ?? "";

  const storageEndpoint =
    asString(config.STORAGE_ENDPOINT) ?? "http://localhost:9000";
  const storageBucket = asString(config.STORAGE_BUCKET) ?? "rss-payloads";
  const storageAccessKey = asString(config.STORAGE_ACCESS_KEY) ?? "metahunt";
  const storageSecretKey = asString(config.STORAGE_SECRET_KEY) ?? "metahunt123";
  const storageRegion = asString(config.STORAGE_REGION) ?? "us-east-1";
  assertUrl("STORAGE_ENDPOINT", storageEndpoint);

  const openaiApiKey = asString(config.OPENAI_API_KEY) ?? "";
  const openaiModel = asString(config.OPENAI_MODEL) ?? "gpt-4o-mini";
  const llmExtractionEnabled = parseBoolean(
    asString(config.LLM_EXTRACTION_ENABLED),
    false,
  );
  if (llmExtractionEnabled && openaiApiKey.length === 0) {
    throw new Error(
      "OPENAI_API_KEY is required when LLM_EXTRACTION_ENABLED=true",
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
    STORAGE_ENDPOINT: storageEndpoint,
    STORAGE_BUCKET: storageBucket,
    STORAGE_ACCESS_KEY: storageAccessKey,
    STORAGE_SECRET_KEY: storageSecretKey,
    STORAGE_REGION: storageRegion,
    OPENAI_API_KEY: openaiApiKey,
    OPENAI_MODEL: openaiModel,
    LLM_EXTRACTION_ENABLED: llmExtractionEnabled,
  };
}
