import { CachedVacancyExtractor } from "./cached-vacancy-extractor";
import type { ExtractionIdentity, ExtractionResult, VacancyExtractor } from "./vacancy-extractor";

const identity: ExtractionIdentity = {
  specHash: "spec",
  inputHash: "input",
  provider: "openai-generic",
  model: "deepseek-v4-flash",
  bamlVersion: "0.222.0",
  bamlSourceHash: "source",
  taxonomyHash: "taxonomy",
};

const providerUsage = {
  in: 17,
  out: 5,
  cached: 0,
  client: "DeepSeekClient",
  provider: "openai-generic",
  model: "deepseek-v4-flash",
  ms: 12,
};

function dbHarness(initial: "absent" | "failed" = "absent") {
  const canReclaim = initial === "failed";
  let artifact:
    | {
        status: "pending" | "completed" | "failed";
        data: ExtractionResult["data"];
        usage: typeof providerUsage | null;
      }
    | undefined = initial === "failed" ? { status: "failed", data: null, usage: null } : undefined;
  const execute = jest.fn(async (query: unknown) => {
    const text = JSON.stringify(query);
    if (text.includes("INSERT INTO extraction_artifacts")) {
      if (artifact) return { rows: [] };
      artifact = { status: "pending", data: null, usage: null };
      return { rows: [{ id: "artifact-1" }] };
    }
    if (text.includes("SELECT id, status, data, error, usage")) {
      return {
        rows: artifact
          ? [
              {
                id: "artifact-1",
                status: artifact.status,
                data: artifact.data,
                error: null,
                usage: artifact.usage,
              },
            ]
          : [],
      };
    }
    if (text.includes("lease_expires_at < now()")) {
      if (!canReclaim) return { rows: [] };
      artifact = { status: "pending", data: null, usage: null };
      return { rows: [{ id: "artifact-1" }] };
    }
    if (text.includes("completed_at = now()")) {
      artifact = { status: "completed", data: sample.data, usage: providerUsage };
      return { rows: [] };
    }
    throw new Error(`Unexpected query: ${text}`);
  });
  return { execute, current: () => artifact };
}

const sample: ExtractionResult = {
  data: { role: "Backend Engineer" } as ExtractionResult["data"],
  meta: { promptVersion: 3, usage: providerUsage },
};

describe("CachedVacancyExtractor", () => {
  it("uses one owner for concurrent identical input and records a zero-cost hit", async () => {
    const db = dbHarness();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const raw: VacancyExtractor = {
      identity: jest.fn(async () => identity),
      extract: jest.fn(async () => {
        await gate;
        return sample;
      }),
    };
    const extractor = new CachedVacancyExtractor(db as never, raw);

    const owner = extractor.extract("same input");
    // Start a genuinely overlapping caller only after the first one owns the
    // pending lease, so this exercises the contested-artifact branch rather
    // than relying on microtask ordering in the test runner.
    while ((raw.extract as jest.Mock).mock.calls.length === 0)
      await new Promise((resolve) => setTimeout(resolve, 1));
    const waiter = extractor.extract("same input");
    await new Promise((resolve) => setTimeout(resolve, 10));
    release();
    const [first, second] = await Promise.all([owner, waiter]);

    expect(raw.extract).toHaveBeenCalledTimes(1);
    expect([first.cache.hit, second.cache.hit].sort()).toEqual([false, true]);
    const hit = first.cache.hit ? first : second;
    expect(hit.meta.usage).toMatchObject({ in: 0, out: 0, cached: 0, ms: 0 });
    expect(db.current()).toMatchObject({ status: "completed", usage: providerUsage });
  });

  it("reclaims an expired failed artifact instead of making a second cache key", async () => {
    const db = dbHarness("failed");
    const raw: VacancyExtractor = {
      identity: jest.fn(async () => identity),
      extract: jest.fn(async () => sample),
    };
    const result = await new CachedVacancyExtractor(db as never, raw).extract("same input");

    expect(raw.extract).toHaveBeenCalledTimes(1);
    expect(result.cache).toMatchObject({ artifactId: "artifact-1", hit: false });
    expect(db.current()).toMatchObject({ status: "completed" });
  });
});
