import { Injectable } from "@nestjs/common";

import type { ExtractedVacancy } from "../../baml_client/types";
import type { Executor } from "../repositories/executor";
import {
  VacancyRepository,
  type SkillLink,
  type VacancyUpsertValues,
} from "../repositories/vacancy.repository";
import { CompanyResolverService } from "./company-resolver.service";
import { NodeResolverService } from "./node-resolver.service";

@Injectable()
export class VacancyLoaderService {
  constructor(
    private readonly repo: VacancyRepository,
    private readonly companyResolver: CompanyResolverService,
    private readonly nodeResolver: NodeResolverService,
  ) {}

  async loadFromRecord(rssRecordId: string): Promise<string> {
    const record = await this.repo.findRecord(rssRecordId);
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

    // One transaction for the whole load: company/node resolution AND the
    // vacancy upsert commit together, so a crash mid-resolve can't leave
    // orphan company/node rows behind a vacancy that never landed.
    return this.repo.runInTransaction(async (tx) => {
      const companyId = extracted.companyName
        ? await this.companyResolver.resolve(
            record.sourceId,
            extracted.companyName,
            tx,
          )
        : null;
      const roleNodeId = extracted.role
        ? await this.nodeResolver.resolve("ROLE", extracted.role, tx)
        : null;
      const domainNodeId = extracted.domain
        ? await this.nodeResolver.resolve("DOMAIN", extracted.domain, tx)
        : null;

      const skillLinks = await this.resolveSkillLinks(extracted, tx);

      const values: VacancyUpsertValues = {
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
        // Denormalized for dedup pre-filter — see vacancies.published_at note.
        publishedAt: record.publishedAt,
      };

      return this.repo.upsertWithSkills(values, skillLinks, tx);
    });
  }

  // Resolve skill names to taxonomy node ids, deduped by node. Distinct
  // spellings of the same skill (e.g. "react" / "react.js") collapse to one
  // alias-resolved node; when a node appears as both required and optional,
  // required wins.
  private async resolveSkillLinks(
    extracted: ExtractedVacancy,
    executor: Executor,
  ): Promise<SkillLink[]> {
    const byNode = new Map<string, SkillLink>();
    for (const name of extracted.skills?.required ?? []) {
      const nodeId = await this.nodeResolver.resolve("SKILL", name, executor);
      byNode.set(nodeId, { nodeId, isRequired: true });
    }
    for (const name of extracted.skills?.optional ?? []) {
      const nodeId = await this.nodeResolver.resolve("SKILL", name, executor);
      if (!byNode.has(nodeId)) {
        byNode.set(nodeId, { nodeId, isRequired: false });
      }
    }
    return Array.from(byNode.values());
  }
}
