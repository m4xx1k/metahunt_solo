import { Inject, Injectable } from "@nestjs/common";
import { Collector } from "@boundaryml/baml";
import { eq } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { b } from "../../baml_client";
import type {
  ExtractionResult,
  ExtractionUsage,
  VacancyExtractor,
} from "./vacancy-extractor";

export const PROMPT_VERSION = 3;

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
      const data = await b.ExtractVacancy(text, roles, domains, skills, {
        collector,
      });
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

    const joinNames = (type: "ROLE" | "DOMAIN" | "SKILL") =>
      verified
        .filter((n) => n.type === type)
        .map((n) => n.name)
        // Stable order keeps the prompt prefix byte-identical between calls,
        // which is what lets provider-side prompt caching kick in.
        .sort((a, b) => a.localeCompare(b))
        .join(", ");

    this.taxonomyCache = {
      roles: joinNames("ROLE"),
      domains: joinNames("DOMAIN"),
      skills: joinNames("SKILL"),
      expiresAt: now + TAXONOMY_CACHE_TTL_MS,
    };
    return {
      roles: this.taxonomyCache.roles,
      domains: this.taxonomyCache.domains,
      skills: this.taxonomyCache.skills,
    };
  }
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
    // BAML's LlmCall exposes the BAML client name, not the underlying OpenAI
    // model. The model is configured at the BAML client level via the
    // OPENAI_MODEL env var (see baml_src/clients.baml), so read it directly.
    model: process.env.OPENAI_MODEL ?? "unknown",
    ms: last?.timing?.durationMs ?? null,
  };
}
