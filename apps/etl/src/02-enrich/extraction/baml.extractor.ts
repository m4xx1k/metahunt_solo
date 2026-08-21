import { Inject, Injectable } from "@nestjs/common";

import { Collector } from "@boundaryml/baml";
import { eq } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { b } from "../../baml_client";
import { joinNamesByType } from "../../platform/shared/node-names";
import { sha256 } from "../dedup/content-fingerprint";

import {
  BAML_PRODUCTION_SOURCE_HASH,
  BAML_RUNTIME_VERSION,
} from "./baml-production-identity.generated";
import type {
  ExtractionIdentity,
  ExtractionResult,
  ExtractionUsage,
  VacancyExtractor,
} from "./vacancy-extractor";

/** A dashboard label only; spec_hash is the correctness boundary. */
export const PROMPT_VERSION = 4;

const TAXONOMY_CACHE_TTL_MS = 60_000;

@Injectable()
export class BamlVacancyExtractor implements VacancyExtractor {
  private taxonomyCache: {
    roles: string;
    domains: string;
    skills: string;
    expiresAt: number;
  } | null = null;

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async extract(text: string): Promise<ExtractionResult> {
    const collector = new Collector("vacancy-extract");
    const { roles, domains, skills } = await this.loadTaxonomy();

    try {
      const extracted = await b.ExtractVacancy(text, roles, domains, skills, {
        collector,
      });
      const data = ensureVerifiedTechnicalRole(extracted, roles);
      return {
        data,
        meta: { promptVersion: PROMPT_VERSION, usage: readUsage(collector) },
      };
    } catch (err) {
      // BAML attaches `detailed_message` (full prompt + raw LLM response) to
      // its errors. Temporal logs the entire error on activity failure — that
      // is a lot of log volume per record. Keep the gist only; set
      // BAML_LOG=DEBUG locally for the full payload.
      const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
      return {
        data: null,
        meta: {
          promptVersion: PROMPT_VERSION,
          usage: readUsage(collector),
          error: `BAML extraction: ${msg}`,
        },
      };
    }
  }

  async identity(text: string): Promise<ExtractionIdentity> {
    const taxonomy = await this.loadTaxonomy();
    const provider = "openai-generic";
    const model = process.env.DEEPSEEK_MODEL ?? "unknown";
    const taxonomyHash = sha256(
      [taxonomy.roles, taxonomy.domains, taxonomy.skills]
        .flatMap((part) => part.split(", ").filter(Boolean))
        .sort((a, b) => a.localeCompare(b))
        .join("\n"),
    );
    const specHash = sha256(
      [
        "ExtractVacancy",
        BAML_PRODUCTION_SOURCE_HASH,
        BAML_RUNTIME_VERSION,
        provider,
        model,
        taxonomyHash,
      ].join("|"),
    );
    return {
      specHash,
      inputHash: sha256(text),
      provider,
      model,
      bamlVersion: BAML_RUNTIME_VERSION,
      bamlSourceHash: BAML_PRODUCTION_SOURCE_HASH,
      taxonomyHash,
    };
  }

  private async loadTaxonomy(): Promise<{
    roles: string;
    domains: string;
    skills: string;
  }> {
    const now = Date.now();
    if (this.taxonomyCache && this.taxonomyCache.expiresAt > now) {
      return {
        roles: this.taxonomyCache.roles,
        domains: this.taxonomyCache.domains,
        skills: this.taxonomyCache.skills,
      };
    }

    const verified = await this.db
      .select({
        type: schema.nodes.type,
        name: schema.nodes.canonicalName,
      })
      .from(schema.nodes)
      .where(eq(schema.nodes.status, "VERIFIED"));

    this.taxonomyCache = {
      roles: joinNamesByType(verified, "ROLE"),
      domains: joinNamesByType(verified, "DOMAIN"),
      skills: joinNamesByType(verified, "SKILL"),
      expiresAt: now + TAXONOMY_CACHE_TTL_MS,
    };
    return {
      roles: this.taxonomyCache.roles,
      domains: this.taxonomyCache.domains,
      skills: this.taxonomyCache.skills,
    };
  }
}

/**
 * Roles outside the verified taxonomy are created as NEW nodes by the loader
 * and are consequently invisible in public search. The prompt is the primary
 * classifier; this is the final integrity guard for technical vacancies.
 */
function ensureVerifiedTechnicalRole(
  data: Awaited<ReturnType<typeof b.ExtractVacancy>>,
  roles: string,
): Awaited<ReturnType<typeof b.ExtractVacancy>> {
  if (data.isTech !== true) return data;

  const verifiedRoles = new Set(roles.split(", ").filter(Boolean));
  if (data.role && verifiedRoles.has(data.role)) return data;

  return {
    ...data,
    // Software Engineer is the deliberately verified generic fallback. Keep
    // null only for a malformed taxonomy that does not contain it.
    role: verifiedRoles.has("Software Engineer") ? "Software Engineer" : null,
  };
}

function readUsage(collector: Collector): ExtractionUsage {
  const u = collector.usage;
  const last = collector.last;
  const call = last?.calls?.[0];
  return {
    in: u.inputTokens ?? 0,
    out: u.outputTokens ?? 0,
    cached: u.cachedInputTokens ?? 0,
    client: call?.clientName ?? "unknown",
    provider: call?.provider ?? "unknown",
    // BAML's LlmCall exposes the client name, not the underlying model.
    // ExtractVacancy runs on DeepSeekClient (see baml_src/clients.baml), whose
    // model comes from DEEPSEEK_MODEL; this string keys the extraction_cost view.
    model: process.env.DEEPSEEK_MODEL ?? "unknown",
    ms: last?.timing?.durationMs ?? null,
  };
}
