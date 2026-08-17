import { Inject, Injectable } from "@nestjs/common";

import { sql } from "drizzle-orm";

import { DRIZZLE } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import type { ExtractionIdentity, ExtractionResult, VacancyExtractor } from "./vacancy-extractor";

export const RAW_VACANCY_EXTRACTOR = Symbol("RAW_VACANCY_EXTRACTOR");
const LEASE_SECONDS = 120;
const POLL_MS = 50;

export type CachedExtractionResult = ExtractionResult & {
  cache: ExtractionIdentity & { artifactId: string; hit: boolean };
};

/** A unique DB claim makes concurrent workers share one paid provider call. */
@Injectable()
export class CachedVacancyExtractor {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    @Inject(RAW_VACANCY_EXTRACTOR) private readonly raw: VacancyExtractor,
  ) {}

  async extract(text: string): Promise<CachedExtractionResult> {
    const identity = await this.raw.identity(text);
    for (;;) {
      const artifact = await this.readOrClaim(identity);
      if (artifact.kind === "completed") {
        return {
          data: artifact.data,
          meta: {
            promptVersion: PROMPT_VERSION_FOR_AUDIT,
            usage: artifact.usage,
            ...(artifact.error ? { error: artifact.error } : {}),
          },
          cache: { ...identity, artifactId: artifact.id, hit: true },
        };
      }
      if (artifact.kind === "owner") {
        const result = await this.raw.extract(text);
        const error = result.data ? null : (result.meta.error ?? "extraction failed");
        await this.db.execute(sql`
          UPDATE extraction_artifacts
          SET status = ${result.data ? "completed" : "failed"},
              data = ${result.data}, error = ${error}, usage = ${result.meta.usage},
              completed_at = now(), lease_expires_at = NULL
          WHERE id = ${artifact.id} AND status = 'pending'
        `);
        return { ...result, cache: { ...identity, artifactId: artifact.id, hit: false } };
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
  }

  private async readOrClaim(identity: ExtractionIdentity): Promise<
    | { kind: "owner"; id: string }
    | {
        kind: "completed";
        id: string;
        data: ExtractionResult["data"];
        error?: string;
        usage: ExtractionResult["meta"]["usage"];
      }
    | { kind: "wait" }
  > {
    const inserted = await this.db.execute<{ id: string }>(sql`
      INSERT INTO extraction_artifacts (
        spec_hash, input_hash, status, lease_expires_at, provider, model,
        baml_version, baml_source_hash, taxonomy_hash
      ) VALUES (
        ${identity.specHash}, ${identity.inputHash}, 'pending',
        now() + interval '${sql.raw(String(LEASE_SECONDS))} seconds', ${identity.provider}, ${identity.model},
        ${identity.bamlVersion}, ${identity.bamlSourceHash}, ${identity.taxonomyHash}
      ) ON CONFLICT (spec_hash, input_hash) DO NOTHING RETURNING id
    `);
    if (inserted.rows[0]) return { kind: "owner", id: inserted.rows[0].id };
    const existing = await this.db.execute<{
      id: string;
      status: string;
      data: ExtractionResult["data"];
      error: string | null;
      usage: ExtractionResult["meta"]["usage"] | null;
    }>(sql`
      SELECT id, status, data, error, usage FROM extraction_artifacts
      WHERE spec_hash = ${identity.specHash} AND input_hash = ${identity.inputHash}
    `);
    const row = existing.rows[0];
    if (!row) return { kind: "wait" };
    if (row.status === "completed") {
      return {
        kind: "completed",
        id: row.id,
        data: row.data,
        usage: row.usage ?? zeroUsage(identity),
        ...(row.error ? { error: row.error } : {}),
      };
    }
    const claimed = await this.db.execute<{ id: string }>(sql`
      UPDATE extraction_artifacts SET status = 'pending', lease_expires_at = now() + interval '${sql.raw(String(LEASE_SECONDS))} seconds', error = NULL
      WHERE id = ${row.id} AND status IN ('pending', 'failed')
        AND (lease_expires_at IS NULL OR lease_expires_at < now())
      RETURNING id
    `);
    return claimed.rows[0] ? { kind: "owner", id: claimed.rows[0].id } : { kind: "wait" };
  }
}

const PROMPT_VERSION_FOR_AUDIT = 3;
function zeroUsage(identity: ExtractionIdentity): ExtractionResult["meta"]["usage"] {
  return {
    in: 0,
    out: 0,
    cached: 0,
    client: "cache",
    provider: identity.provider,
    model: identity.model,
    ms: 0,
  };
}
