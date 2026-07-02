import { createHash } from "node:crypto";

import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { RankingService } from "../ranking/ranking.service";
import type { SkillRef } from "../ranking/ranking.contract";
import {
  CANDIDATE_EXTRACTOR,
  type CandidateExtractorPort,
} from "./candidate-extractor.port";
import type {
  CandidateNodeRef,
  CandidateView,
  CvIngestResult,
  SampleCandidate,
} from "./cv.contract";

// Ingest a CV: hash → (reuse | extract → resolve → store). The content hash
// makes re-upload idempotent — the same text never hits the LLM twice. Skills
// are resolve-only (RankingService.resolveSkills): existing nodes match,
// unknown skills are kept as strings, never created (they'd be inert anyway).
@Injectable()
export class CandidateLoaderService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    @Inject(CANDIDATE_EXTRACTOR) private readonly extractor: CandidateExtractorPort,
    private readonly ranking: RankingService,
  ) {}

  async loadFromText(rawText: string): Promise<CvIngestResult> {
    const sourceText = rawText.trim();
    if (sourceText.length === 0) {
      throw new BadRequestException("empty CV text");
    }
    const contentHash = createHash("sha256")
      .update(sourceText.replace(/\s+/g, " ").toLowerCase())
      .digest("hex");

    const existing = await this.db
      .select({ id: schema.candidates.id })
      .from(schema.candidates)
      .where(eq(schema.candidates.contentHash, contentHash));
    if (existing[0]) return this.buildResult(existing[0].id, true);

    const extracted = await this.extractor.extract(sourceText);
    const skills = [
      ...(extracted.skills?.required ?? []),
      ...(extracted.skills?.optional ?? []),
    ];
    const resolved = await this.ranking.resolveSkills(skills);

    const id = await this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(schema.candidates)
        .values({
          contentHash,
          sourceText,
          extracted: { ...extracted, unmatchedSkills: resolved.unmatched },
          role: extracted.role ?? null,
          seniority: extracted.seniority ?? null,
          englishLevel: extracted.englishLevel ?? null,
          experienceYears:
            extracted.experienceYears != null
              ? Math.round(extracted.experienceYears)
              : null,
        })
        .onConflictDoNothing({ target: schema.candidates.contentHash })
        .returning({ id: schema.candidates.id });

      // Lost an insert race — another request stored the same CV first.
      const candidateId =
        inserted[0]?.id ??
        (
          await tx
            .select({ id: schema.candidates.id })
            .from(schema.candidates)
            .where(eq(schema.candidates.contentHash, contentHash))
        )[0]?.id;
      if (!candidateId) throw new Error("failed to persist candidate");

      if (inserted[0] && resolved.matched.length > 0) {
        await tx
          .insert(schema.candidateNodes)
          .values(
            resolved.matched.map((m) => ({ candidateId, nodeId: m.id })),
          )
          .onConflictDoNothing();
      }
      return candidateId;
    });

    return this.buildResult(id, false);
  }

  // Skill inputs for ranking a stored candidate (GET /cv/:id/matches): resolved
  // nodes with their IDF weight + the unmatched strings kept on the candidate.
  async getMatchInput(
    id: string,
  ): Promise<{ matched: SkillRef[]; unmatched: string[] }> {
    const rows = await this.db
      .select({ extracted: schema.candidates.extracted })
      .from(schema.candidates)
      .where(eq(schema.candidates.id, id));
    if (!rows[0]) throw new NotFoundException(`candidate ${id} not found`);

    const extracted = rows[0].extracted as Record<string, unknown>;
    return {
      matched: await this.weightedMatchedNodes(id),
      unmatched: (extracted.unmatchedSkills as string[]) ?? [],
    };
  }

  // Inputs for GET /cv/:id/recommendations: the candidate's weighted skill nodes
  // plus the role/seniority that define the recommendation cohort.
  async getRecommendInput(
    id: string,
  ): Promise<{ matched: SkillRef[]; role: string | null; seniority: string | null }> {
    const rows = await this.db
      .select({
        role: schema.candidates.role,
        seniority: schema.candidates.seniority,
      })
      .from(schema.candidates)
      .where(eq(schema.candidates.id, id));
    const row = rows[0];
    if (!row) throw new NotFoundException(`candidate ${id} not found`);
    return {
      matched: await this.weightedMatchedNodes(id),
      role: row.role,
      seniority: row.seniority,
    };
  }

  private async weightedMatchedNodes(id: string): Promise<SkillRef[]> {
    const matched = await this.db
      .select({
        id: schema.nodes.id,
        name: schema.nodes.canonicalName,
        weight: schema.nodeStats.weight,
      })
      .from(schema.candidateNodes)
      .innerJoin(schema.nodes, eq(schema.nodes.id, schema.candidateNodes.nodeId))
      .leftJoin(
        schema.nodeStats,
        eq(schema.nodeStats.nodeId, schema.candidateNodes.nodeId),
      )
      .where(eq(schema.candidateNodes.candidateId, id));
    return matched.map((m) => ({ id: m.id, name: m.name, weight: m.weight ?? 0 }));
  }

  // Seeded demo profiles for the reverse-ATS picker (candidate.type = 'sample'),
  // in seed order. Label/hint ride extracted.sample; role is the fallback label.
  async listSamples(): Promise<SampleCandidate[]> {
    const rows = await this.db
      .select({
        id: schema.candidates.id,
        role: schema.candidates.role,
        extracted: schema.candidates.extracted,
      })
      .from(schema.candidates)
      .where(eq(schema.candidates.type, "sample"))
      .orderBy(schema.candidates.createdAt);
    return rows.map((r) => {
      const sample = ((r.extracted as Record<string, unknown>).sample ?? {}) as {
        label?: string;
        hint?: string;
      };
      return {
        candidateId: r.id,
        label: sample.label ?? r.role ?? "profile",
        hint: sample.hint ?? "",
      };
    });
  }

  async getById(id: string): Promise<CandidateView> {
    const rows = await this.db
      .select()
      .from(schema.candidates)
      .where(eq(schema.candidates.id, id));
    const row = rows[0];
    if (!row) throw new NotFoundException(`candidate ${id} not found`);
    const matched = await this.matchedNodes(id);
    const extracted = row.extracted as Record<string, unknown>;
    return {
      candidateId: id,
      reused: false,
      role: row.role,
      seniority: row.seniority,
      englishLevel: row.englishLevel,
      experienceYears: row.experienceYears,
      matched,
      unmatched: (extracted.unmatchedSkills as string[]) ?? [],
      extracted,
    };
  }

  private async buildResult(
    id: string,
    reused: boolean,
  ): Promise<CvIngestResult> {
    const rows = await this.db
      .select({
        role: schema.candidates.role,
        seniority: schema.candidates.seniority,
        extracted: schema.candidates.extracted,
      })
      .from(schema.candidates)
      .where(eq(schema.candidates.id, id));
    const row = rows[0];
    const matched = await this.matchedNodes(id);
    const extracted = (row?.extracted as Record<string, unknown>) ?? {};
    return {
      candidateId: id,
      reused,
      role: row?.role ?? null,
      seniority: row?.seniority ?? null,
      matched,
      unmatched: (extracted.unmatchedSkills as string[]) ?? [],
    };
  }

  private async matchedNodes(id: string): Promise<CandidateNodeRef[]> {
    return this.db
      .select({ id: schema.nodes.id, name: schema.nodes.canonicalName })
      .from(schema.candidateNodes)
      .innerJoin(schema.nodes, eq(schema.nodes.id, schema.candidateNodes.nodeId))
      .where(eq(schema.candidateNodes.candidateId, id));
  }
}
