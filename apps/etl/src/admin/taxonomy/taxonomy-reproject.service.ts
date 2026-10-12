import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";

import { and, eq, inArray, sql, TransactionRollbackError } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import type { Executor } from "../../02-enrich/loader/repositories/executor";
import { NodeRepository } from "../../02-enrich/loader/repositories/node.repository";
import type { SkillLink } from "../../02-enrich/loader/repositories/vacancy.repository";
import { VacancyLoaderService } from "../../02-enrich/loader/services/vacancy-loader.service";
import { CandidateLoaderService } from "../../03-discovery/cv/candidate-loader.service";
import { normalizeAliasName } from "../../platform/shared/normalize-alias";

import type {
  NodeLinkDelta,
  ReprojectResult,
  SplitNodeDto,
  SplitResult,
} from "./taxonomy.contract";

// Keeps each write transaction short on big nodes (.NET ≈ 1.4k vacancies).
const REPROJECT_BATCH = 100;

const linkKey = (l: SkillLink) => `${l.nodeId}|${l.isRequired}|${l.requirementGroup ?? ""}`;

type Counts = Map<string, { vb: number; va: number; cb: number; ca: number }>;

// Taxonomy edits change the alias mapping, then re-run each record's own
// resolution path over the rows the edit can affect. Facts are never touched,
// so the inverse edit restores the original links.
@Injectable()
export class TaxonomyReprojectService {
  private readonly logger = new Logger(TaxonomyReprojectService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly vacancyLoader: VacancyLoaderService,
    private readonly candidateLoader: CandidateLoaderService,
    private readonly nodes: NodeRepository,
  ) {}

  // Every record linked to the node is re-resolved. Pass `executor` to run
  // inside a caller's transaction (dry-run); otherwise each batch commits.
  async reprojectNode(nodeId: string, executor?: Executor): Promise<ReprojectResult> {
    const db = executor ?? this.db;
    await this.findSkillNode(nodeId, db);
    const inTx = <T>(work: (tx: Executor) => Promise<T>) =>
      executor ? work(executor) : this.db.transaction(work);

    const counts: Counts = new Map();
    const bump = (id: string, field: "vb" | "va" | "cb" | "ca") => {
      const c = counts.get(id) ?? { vb: 0, va: 0, cb: 0, ca: 0 };
      c[field] += 1;
      counts.set(id, c);
    };

    const vacancies = await db
      .select({ id: schema.vacancies.id, recordId: schema.vacancies.lastRssRecordId })
      .from(schema.vacancyNodes)
      .innerJoin(schema.vacancies, eq(schema.vacancies.id, schema.vacancyNodes.vacancyId))
      .where(eq(schema.vacancyNodes.nodeId, nodeId));
    const vacancyStats = { scanned: vacancies.length, changed: 0, skipped: 0 };

    for (let i = 0; i < vacancies.length; i += REPROJECT_BATCH) {
      const batch = vacancies.slice(i, i + REPROJECT_BATCH);
      await inTx(async (tx) => {
        const beforeRows = await tx
          .select()
          .from(schema.vacancyNodes)
          .where(
            inArray(
              schema.vacancyNodes.vacancyId,
              batch.map((v) => v.id),
            ),
          );
        for (const v of batch) {
          const before: SkillLink[] = beforeRows
            .filter((r) => r.vacancyId === v.id)
            .map((r) => ({
              nodeId: r.nodeId,
              isRequired: r.isRequired,
              requirementGroup: r.requirementGroup ?? undefined,
            }));
          const after = await this.vacancyLoader.relinkSkills(v.id, v.recordId, tx);
          if (!after) {
            vacancyStats.skipped += 1;
            continue;
          }
          const beforeKeys = new Set(before.map(linkKey));
          const afterKeys = new Set(after.map(linkKey));
          if (
            beforeKeys.size === afterKeys.size &&
            [...afterKeys].every((k) => beforeKeys.has(k))
          ) {
            continue;
          }
          vacancyStats.changed += 1;
          before.forEach((l) => bump(l.nodeId, "vb"));
          after.forEach((l) => bump(l.nodeId, "va"));
        }
      });
      this.logger.log(`reproject ${nodeId}: ${i + batch.length}/${vacancies.length} vacancies`);
    }

    const candidates = await db
      .select({ id: schema.candidateNodes.candidateId })
      .from(schema.candidateNodes)
      .where(eq(schema.candidateNodes.nodeId, nodeId));
    const candidateStats = { scanned: candidates.length, changed: 0 };
    await inTx(async (tx) => {
      for (const c of candidates) {
        const { before, after } = await this.candidateLoader.relinkSkills(c.id, nodeId, tx);
        if (before.length === after.length && after.every((id) => before.includes(id))) continue;
        candidateStats.changed += 1;
        before.forEach((id) => bump(id, "cb"));
        after.forEach((id) => bump(id, "ca"));
      }
    });

    return {
      nodeId,
      vacancies: vacancyStats,
      candidates: candidateStats,
      links: await this.describeDeltas(counts, db),
    };
  }

  // Move some of a node's aliases to another (new or existing) node of the
  // same type, then reproject the source. The source node is never deleted.
  async split(sourceId: string, body: SplitNodeDto): Promise<SplitResult> {
    const aliases = [...new Set(body.aliases.map(normalizeAliasName).filter(Boolean))];
    if (aliases.length === 0) throw new BadRequestException("aliases must not be empty");
    const targetName = body.target.name?.trim();
    const targetNodeId = body.target.nodeId;
    if (!targetName === !targetNodeId) {
      throw new BadRequestException("target needs exactly one of name or nodeId");
    }

    const moveAliases = async (tx: Executor) => {
      const source = await this.findSkillNode(sourceId, tx, true);
      const owned = await tx
        .select({ name: schema.nodeAliases.name })
        .from(schema.nodeAliases)
        .where(
          and(eq(schema.nodeAliases.nodeId, sourceId), inArray(schema.nodeAliases.name, aliases)),
        );
      const missing = aliases.filter((a) => !owned.some((o) => o.name === a));
      if (missing.length > 0) {
        throw new BadRequestException(`not aliases of this node: ${missing.join(", ")}`);
      }

      const target = targetNodeId
        ? { ...(await this.findSkillNode(targetNodeId, tx)), created: false }
        : await this.findOrCreateTarget(targetName ?? "", tx);
      if (target.id === sourceId) throw new BadRequestException("target must differ from source");

      await tx
        .update(schema.nodeAliases)
        .set({ nodeId: target.id })
        .where(
          and(eq(schema.nodeAliases.nodeId, sourceId), inArray(schema.nodeAliases.name, aliases)),
        );
      return {
        source: { id: source.id, name: source.canonicalName },
        target: { id: target.id, name: target.canonicalName, created: target.created },
      };
    };

    if (!body.dryRun) {
      const moved = await this.db.transaction(moveAliases);
      const reprojection = await this.reprojectNode(sourceId);
      return { dryRun: false, aliases, ...moved, ...reprojection };
    }

    let preview: SplitResult | undefined;
    try {
      await this.db.transaction(async (tx) => {
        const moved = await moveAliases(tx);
        preview = { dryRun: true, aliases, ...moved, ...(await this.reprojectNode(sourceId, tx)) };
        tx.rollback();
      });
    } catch (err) {
      if (!(err instanceof TransactionRollbackError)) throw err;
    }
    if (!preview) throw new Error("dry-run produced no preview");
    return preview;
  }

  private async findSkillNode(id: string, db: Executor, forUpdate = false) {
    const query = db.select().from(schema.nodes).where(eq(schema.nodes.id, id));
    const [node] = forUpdate ? await query.for("update") : await query;
    if (!node) throw new NotFoundException(`Node ${id} not found`);
    if (node.type !== "SKILL") throw new BadRequestException("only SKILL nodes can be split");
    return node;
  }

  private async findOrCreateTarget(name: string, tx: Executor) {
    if (name.length === 0) throw new BadRequestException("target name must not be empty");
    const [existing] = await tx
      .select()
      .from(schema.nodes)
      .where(
        and(
          eq(schema.nodes.type, "SKILL"),
          sql`lower(${schema.nodes.canonicalName}) = lower(${name})`,
        ),
      );
    if (existing) return { ...existing, created: false };

    const id = await this.nodes.insertReturningId("SKILL", name, tx);
    if (!id) throw new BadRequestException(`could not create node "${name}"`);
    const [created] = await tx
      .update(schema.nodes)
      .set({ status: "VERIFIED" })
      .where(eq(schema.nodes.id, id))
      .returning();
    return { ...created, created: true };
  }

  private async describeDeltas(counts: Counts, db: Executor): Promise<NodeLinkDelta[]> {
    const changed = [...counts].filter(([, c]) => c.vb !== c.va || c.cb !== c.ca);
    if (changed.length === 0) return [];
    const names = await db
      .select({ id: schema.nodes.id, name: schema.nodes.canonicalName })
      .from(schema.nodes)
      .where(
        inArray(
          schema.nodes.id,
          changed.map(([id]) => id),
        ),
      );
    return changed
      .map(([id, c]) => ({
        nodeId: id,
        name: names.find((n) => n.id === id)?.name ?? id,
        vacanciesBefore: c.vb,
        vacanciesAfter: c.va,
        candidatesBefore: c.cb,
        candidatesAfter: c.ca,
      }))
      .sort((a, b) => b.vacanciesBefore - a.vacanciesBefore || b.vacanciesAfter - a.vacanciesAfter);
  }
}
