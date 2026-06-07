import { Inject, Injectable } from "@nestjs/common";
import { Collector } from "@boundaryml/baml";
import { eq } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { b } from "../../baml_client";
import type { ExtractedCandidate } from "../../baml_client";

// CV → structured candidate via BAML (mirror of BamlVacancyExtractor). Feeds the
// LLM the same VERIFIED role catalog so a candidate's role lands on a canonical
// name when one fits.
@Injectable()
export class CandidateExtractor {
  private cache: { roles: string; domains: string; expiresAt: number } | null =
    null;

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async extract(text: string): Promise<ExtractedCandidate> {
    const { roles, domains } = await this.loadTaxonomy();
    const collector = new Collector("candidate-extract");
    return b.ExtractCandidate(text, roles, domains, { collector });
  }

  private async loadTaxonomy(): Promise<{ roles: string; domains: string }> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) {
      return { roles: this.cache.roles, domains: this.cache.domains };
    }
    const verified = await this.db
      .select({ type: schema.nodes.type, name: schema.nodes.canonicalName })
      .from(schema.nodes)
      .where(eq(schema.nodes.status, "VERIFIED"));
    const join = (t: string) =>
      verified
        .filter((n) => n.type === t)
        .map((n) => n.name)
        .sort((a, b) => a.localeCompare(b))
        .join(", ");
    const roles = join("ROLE");
    const domains = join("DOMAIN");
    this.cache = { roles, domains, expiresAt: now + 60_000 };
    return { roles, domains };
  }
}
