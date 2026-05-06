import { Injectable, Inject } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import type { ExtractedVacancy } from "../../baml_client/types";
import { CompanyResolverService } from "./company-resolver.service";
import { NodeResolverService } from "./node-resolver.service";

type SkillLink = { nodeId: string; isRequired: boolean };

@Injectable()
export class VacancyLoaderService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly companyResolver: CompanyResolverService,
    private readonly nodeResolver: NodeResolverService,
  ) {}

  async loadFromRecord(rssRecordId: string): Promise<string> {
    const [record] = await this.db
      .select()
      .from(schema.rssRecords)
      .where(eq(schema.rssRecords.id, rssRecordId));

    if (!record) {
      throw new Error(`rss_record ${rssRecordId} not found`);
    }

    const extracted = (record.extractedData ?? null) as
      | ExtractedVacancy
      | null;
    if (!extracted) {
      throw new Error(
        `rss_record ${rssRecordId} has no extractedData; cannot load`,
      );
    }

    const companyId = extracted.companyName
      ? await this.companyResolver.resolve(
          record.sourceId,
          extracted.companyName,
        )
      : null;

    const roleNodeId = extracted.role
      ? await this.nodeResolver.resolve("ROLE", extracted.role)
      : null;
    const domainNodeId = extracted.domain
      ? await this.nodeResolver.resolve("DOMAIN", extracted.domain)
      : null;

    const requiredSkills = extracted.skills?.required ?? [];
    const optionalSkills = extracted.skills?.optional ?? [];
    // Dedup by nodeId — distinct spellings of the same skill (e.g. "react"
    // and "react.js") collapse to one alias-resolved node, and vacancy_nodes
    // PKs on (vacancy_id, node_id). When a node appears as both required
    // and optional, required wins.
    const byNode = new Map<string, SkillLink>();
    for (const name of requiredSkills) {
      const nodeId = await this.nodeResolver.resolve("SKILL", name);
      byNode.set(nodeId, { nodeId, isRequired: true });
    }
    for (const name of optionalSkills) {
      const nodeId = await this.nodeResolver.resolve("SKILL", name);
      if (!byNode.has(nodeId)) {
        byNode.set(nodeId, { nodeId, isRequired: false });
      }
    }
    const skillLinks: SkillLink[] = Array.from(byNode.values());

    const vacancyValues = {
      sourceId: record.sourceId,
      externalId: record.externalId,
      lastRssRecordId: record.id,
      title: record.title,
      description: record.description,
      companyId,
      roleNodeId,
      domainNodeId,
      seniority: extracted.seniority ?? null,
      workFormat: extracted.workFormat ?? null,
      employmentType: extracted.employmentType ?? null,
      englishLevel: extracted.englishLevel ?? null,
      experienceYears:
        extracted.experienceYears != null
          ? Math.round(extracted.experienceYears)
          : null,
      salaryMin:
        extracted.salary?.min != null
          ? Math.round(extracted.salary.min)
          : null,
      salaryMax:
        extracted.salary?.max != null
          ? Math.round(extracted.salary.max)
          : null,
      currency: extracted.salary?.currency ?? null,
      engagementType: extracted.engagementType ?? null,
      hasTestAssignment: extracted.hasTestAssignment ?? null,
      hasReservation: extracted.hasReservation ?? null,
      locations: extracted.locations ?? [],
    };

    return this.db.transaction(async (tx) => {
      const [upserted] = await tx
        .insert(schema.vacancies)
        .values(vacancyValues)
        .onConflictDoUpdate({
          target: [schema.vacancies.sourceId, schema.vacancies.externalId],
          set: {
            lastRssRecordId: vacancyValues.lastRssRecordId,
            title: vacancyValues.title,
            description: vacancyValues.description,
            companyId: vacancyValues.companyId,
            roleNodeId: vacancyValues.roleNodeId,
            domainNodeId: vacancyValues.domainNodeId,
            seniority: vacancyValues.seniority,
            workFormat: vacancyValues.workFormat,
            employmentType: vacancyValues.employmentType,
            englishLevel: vacancyValues.englishLevel,
            experienceYears: vacancyValues.experienceYears,
            salaryMin: vacancyValues.salaryMin,
            salaryMax: vacancyValues.salaryMax,
            currency: vacancyValues.currency,
            engagementType: vacancyValues.engagementType,
            hasTestAssignment: vacancyValues.hasTestAssignment,
            hasReservation: vacancyValues.hasReservation,
            locations: vacancyValues.locations,
            updatedAt: sql`now()`,
          },
        })
        .returning({ id: schema.vacancies.id });

      const vacancyId = upserted.id;

      await tx
        .delete(schema.vacancyNodes)
        .where(eq(schema.vacancyNodes.vacancyId, vacancyId));

      if (skillLinks.length > 0) {
        await tx.insert(schema.vacancyNodes).values(
          skillLinks.map((link) => ({
            vacancyId,
            nodeId: link.nodeId,
            isRequired: link.isRequired,
          })),
        );
      }

      return vacancyId;
    });
  }
}
