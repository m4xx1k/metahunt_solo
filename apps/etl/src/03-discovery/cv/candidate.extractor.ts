import { Inject, Injectable } from "@nestjs/common";

import { Collector } from "@boundaryml/baml";
import { eq } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { b } from "../../baml_client";
import type { ExtractedCandidate } from "../../baml_client";
import { joinNamesByType } from "../../platform/shared/node-names";

import type { CandidateExtractorPort } from "./candidate-extractor.port";

// CV → structured candidate via BAML (mirror of BamlVacancyExtractor). Feeds the
// LLM the same VERIFIED role AND skill catalogs so a candidate's role and named
// practices (Microservices, CI/CD, RAG) land on canonical names — the CV path is
// resolve-only, so an off-list practice just becomes an unmatched string, never
// a new node.
@Injectable()
export class BamlCandidateExtractor implements CandidateExtractorPort {
  private cache: { roles: string; skills: string; expiresAt: number } | null = null;

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async extract(text: string): Promise<ExtractedCandidate> {
    const { roles, skills } = await this.loadTaxonomy();
    const collector = new Collector("candidate-extract");
    return b.ExtractCandidate(text, roles, skills, { collector });
  }

  private async loadTaxonomy(): Promise<{ roles: string; skills: string }> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) {
      return { roles: this.cache.roles, skills: this.cache.skills };
    }
    const verified = await this.db
      .select({ type: schema.nodes.type, name: schema.nodes.canonicalName })
      .from(schema.nodes)
      .where(eq(schema.nodes.status, "VERIFIED"));
    const roles = joinNamesByType(verified, "ROLE");
    const skills = joinNamesByType(verified, "SKILL");
    this.cache = { roles, skills, expiresAt: now + 60_000 };
    return { roles, skills };
  }
}
