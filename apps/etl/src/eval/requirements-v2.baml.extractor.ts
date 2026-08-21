import { Inject, Injectable } from "@nestjs/common";

import { Collector } from "@boundaryml/baml";
import { eq } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { sha256 } from "../02-enrich/dedup/content-fingerprint";
import { BAML_RUNTIME_VERSION } from "../02-enrich/extraction/baml-production-identity.generated";
import type {
  ExtractionIdentity,
  ExtractionResult,
  ExtractionUsage,
  VacancyExtractor,
} from "../02-enrich/extraction/vacancy-extractor";
import { b, RequirementPriority } from "../baml_client";
import type { ExtractedVacancy, ExtractedVacancyRequirementsV2 } from "../baml_client";
import { joinNamesByType } from "../platform/shared/node-names";

/** Eval-only prompt; production continues to use ExtractVacancy unchanged. */
export const REQUIREMENTS_V2_PROMPT_VERSION = 1;
export const BAML_REQUIREMENTS_V2_SOURCE_HASH =
  "7d5d4fa2b99c379172a3d8c1f8708c5fbfa01d5a99f3bf3b84cb9fb168f2c5b6";

const TAXONOMY_CACHE_TTL_MS = 60_000;

@Injectable()
export class BamlRequirementsV2Extractor implements VacancyExtractor {
  private taxonomyCache: { roles: string; skills: string; expiresAt: number } | null = null;

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async extract(text: string): Promise<ExtractionResult> {
    const collector = new Collector("vacancy-requirements-v2-extract");
    const { roles, skills } = await this.loadTaxonomy();
    try {
      const data = await b.ExtractVacancyRequirementsV2(text, roles, skills, { collector });
      return {
        data: toEvalVacancy(data),
        meta: { promptVersion: REQUIREMENTS_V2_PROMPT_VERSION, usage: readUsage(collector) },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
      return {
        data: null,
        meta: {
          promptVersion: REQUIREMENTS_V2_PROMPT_VERSION,
          usage: readUsage(collector),
          error: `BAML Requirements v2 extraction: ${message}`,
        },
      };
    }
  }

  async identity(text: string): Promise<ExtractionIdentity> {
    const taxonomy = await this.loadTaxonomy();
    const provider = "openai-generic";
    const model = process.env.DEEPSEEK_MODEL ?? "unknown";
    const taxonomyHash = sha256(
      [taxonomy.roles, taxonomy.skills]
        .flatMap((part) => part.split(", ").filter(Boolean))
        .sort((a, b) => a.localeCompare(b))
        .join("\n"),
    );
    return {
      specHash: sha256(
        [
          "ExtractVacancyRequirementsV2",
          BAML_REQUIREMENTS_V2_SOURCE_HASH,
          BAML_RUNTIME_VERSION,
          provider,
          model,
          taxonomyHash,
        ].join("|"),
      ),
      inputHash: sha256(text),
      provider,
      model,
      bamlVersion: BAML_RUNTIME_VERSION,
      bamlSourceHash: BAML_REQUIREMENTS_V2_SOURCE_HASH,
      taxonomyHash,
    };
  }

  private async loadTaxonomy(): Promise<{ roles: string; skills: string }> {
    const now = Date.now();
    if (this.taxonomyCache && this.taxonomyCache.expiresAt > now) return this.taxonomyCache;

    const verified = await this.db
      .select({ type: schema.nodes.type, name: schema.nodes.canonicalName })
      .from(schema.nodes)
      .where(eq(schema.nodes.status, "VERIFIED"));
    this.taxonomyCache = {
      roles: joinNamesByType(verified, "ROLE"),
      skills: joinNamesByType(verified, "SKILL"),
      expiresAt: now + TAXONOMY_CACHE_TTL_MS,
    };
    return this.taxonomyCache;
  }
}

function toEvalVacancy(data: ExtractedVacancyRequirementsV2): ExtractedVacancy {
  const requirements = data.requirements.map((requirement) => ({
    priority: requirement.priority === RequirementPriority.MUST ? "must" : "nice",
    ...(requirement.value ? { value: requirement.value } : {}),
    ...(requirement.anyOf ? { anyOf: requirement.anyOf } : {}),
  }));
  return { ...data, requirements } as unknown as ExtractedVacancy;
}

function readUsage(collector: Collector): ExtractionUsage {
  const usage = collector.usage;
  const call = collector.last?.calls?.[0];
  return {
    in: usage.inputTokens ?? 0,
    out: usage.outputTokens ?? 0,
    cached: usage.cachedInputTokens ?? 0,
    client: call?.clientName ?? "unknown",
    provider: call?.provider ?? "unknown",
    model: process.env.DEEPSEEK_MODEL ?? "unknown",
    ms: collector.last?.timing?.durationMs ?? null,
  };
}
