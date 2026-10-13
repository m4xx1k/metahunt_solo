import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";

import { and, eq, inArray, sql, TransactionRollbackError } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import type { Executor } from "../../02-enrich/loader/repositories/executor";
import { NodeRepository } from "../../02-enrich/loader/repositories/node.repository";
import type { SkillLink } from "../../02-enrich/loader/repositories/vacancy.repository";
import { VacancyLoaderService } from "../../02-enrich/loader/services/vacancy-loader.service";
import { CandidateLoaderService } from "../../03-discovery/cv/candidate-loader.service";
import { normalizeAliasName } from "../../platform/shared/normalize-alias";

import type { MoveAliasesDto, MoveAliasesResult, NodeLinkDelta } from "./taxonomy.contract";

type Counts = Map<string, { vb: number; va: number; cb: number; ca: number }>;

// The one taxonomy edit: repoint aliases and re-resolve affected links in one tx.
// Facts are never touched, so the inverse move restores every link; dry-run = rollback.
@Injectable()
export class TaxonomyAliasMoveService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly vacancyLoader: VacancyLoaderService,
    private readonly candidateLoader: CandidateLoaderService,
    private readonly nodes: NodeRepository,
  ) {}

  async moveAliases(sourceId: string, body: MoveAliasesDto): Promise<MoveAliasesResult> {
    const aliases = [...new Set(body.aliases.map(normalizeAliasName).filter(Boolean))];
    if (aliases.length === 0) throw new BadRequestException("aliases must not be empty");
    const targetName = body.target.name?.trim();
    const targetNodeId = body.target.nodeId;
    if (!targetName === !targetNodeId) {
      throw new BadRequestException("target needs exactly one of name or nodeId");
    }
    const dryRun = body.dryRun ?? false;

    let result: MoveAliasesResult | undefined;
    try {
      await this.db.transaction(async (tx) => {
        const moved = await this.repoint(sourceId, aliases, targetName, targetNodeId, tx);
        result = { dryRun, aliases, ...moved, ...(await this.relink(sourceId, aliases, tx)) };
        if (dryRun) tx.rollback();
      });
    } catch (err) {
      if (!(dryRun && err instanceof TransactionRollbackError)) throw err;
    }
    if (!result) throw new Error("move produced no result");
    return result;
  }

  private async repoint(
    sourceId: string,
    aliases: string[],
    targetName: string | undefined,
    targetNodeId: string | undefined,
    tx: Executor,
  ) {
    const source = await this.findSkillNode(sourceId, tx, true);
    const owned = await tx
      .select({ name: schema.nodeAliases.name })
      .from(schema.nodeAliases)
      .where(eq(schema.nodeAliases.nodeId, sourceId));
    const missing = aliases.filter((a) => !owned.some((o) => o.name === a));
    if (missing.length > 0) {
      throw new BadRequestException(`not aliases of this node: ${missing.join(", ")}`);
    }
    // CVs match the canonical name before aliases; moving it alone would
    // send CVs and vacancies spelling it the same way to different nodes.
    if (
      aliases.includes(normalizeAliasName(source.canonicalName)) &&
      aliases.length < owned.length
    ) {
      throw new BadRequestException("the node's own name moves only together with all aliases");
    }

    const target = targetNodeId
      ? { ...(await this.findSkillNode(targetNodeId, tx)), created: false }
      : await this.createTarget(targetName ?? "", sourceId, aliases, tx);
    if (target.id === sourceId) throw new BadRequestException("target must differ from source");
    if (target.status === "HIDDEN") {
      throw new BadRequestException(`"${target.canonicalName}" is hidden; verify it first`);
    }

    await tx
      .update(schema.nodeAliases)
      .set({ nodeId: target.id })
      .where(
        and(eq(schema.nodeAliases.nodeId, sourceId), inArray(schema.nodeAliases.name, aliases)),
      );
    // An emptied source would still catch CVs by its canonical name; hiding it
    // sends them through the moved aliases like vacancies.
    const hidden = aliases.length === owned.length;
    if (hidden) {
      await tx.update(schema.nodes).set({ status: "HIDDEN" }).where(eq(schema.nodes.id, sourceId));
    }
    return {
      source: { id: source.id, name: source.canonicalName, hidden },
      target: { id: target.id, name: target.canonicalName, created: target.created },
    };
  }

  // Every record mentioning a moved alias is linked to the source, so
  // re-resolving the source's records is complete.
  private async relink(nodeId: string, movedAliases: string[], tx: Executor) {
    const counts: Counts = new Map();
    const bump = (id: string, field: "vb" | "va" | "cb" | "ca") => {
      const c = counts.get(id) ?? { vb: 0, va: 0, cb: 0, ca: 0 };
      c[field] += 1;
      counts.set(id, c);
    };

    // The loader's vacancy lock: no two writers rewrite one vacancy's links. New loads
    // still read the old aliases until commit, so run moves with ingest paused.
    const vacancies = await tx
      .select({ id: schema.vacancies.id, recordId: schema.vacancies.lastRssRecordId })
      .from(schema.vacancies)
      .where(
        inArray(
          schema.vacancies.id,
          tx
            .select({ id: schema.vacancyNodes.vacancyId })
            .from(schema.vacancyNodes)
            .where(eq(schema.vacancyNodes.nodeId, nodeId)),
        ),
      )
      .orderBy(schema.vacancies.id)
      .for("update");
    const beforeRows =
      vacancies.length === 0
        ? []
        : await tx
            .select()
            .from(schema.vacancyNodes)
            .where(
              inArray(
                schema.vacancyNodes.vacancyId,
                vacancies.map((v) => v.id),
              ),
            );
    const vacancyStats = { scanned: vacancies.length, changed: 0, skipped: 0 };
    for (const v of vacancies) {
      const before: SkillLink[] = beforeRows
        .filter((r) => r.vacancyId === v.id)
        .map((r) => ({
          nodeId: r.nodeId,
          isRequired: r.isRequired,
          requirementGroup: r.requirementGroup ?? undefined,
        }));
      const relinked = await this.vacancyLoader.relinkSkills(v.id, v.recordId, before, tx);
      if (!relinked) {
        vacancyStats.skipped += 1;
        continue;
      }
      if (!relinked.changed) continue;
      vacancyStats.changed += 1;
      before.forEach((l) => bump(l.nodeId, "vb"));
      relinked.links.forEach((l) => bump(l.nodeId, "va"));
    }

    const candidates = await tx
      .select({ id: schema.candidateNodes.candidateId })
      .from(schema.candidateNodes)
      .where(eq(schema.candidateNodes.nodeId, nodeId));
    const candidateStats = { scanned: candidates.length, changed: 0 };
    for (const c of candidates) {
      const { before, after } = await this.candidateLoader.relinkSkills(
        c.id,
        nodeId,
        movedAliases,
        tx,
      );
      if (before.length === after.length && after.every((id) => before.includes(id))) continue;
      candidateStats.changed += 1;
      before.forEach((id) => bump(id, "cb"));
      after.forEach((id) => bump(id, "ca"));
    }

    return {
      vacancies: vacancyStats,
      candidates: candidateStats,
      links: await this.describeDeltas(counts, tx),
    };
  }

  private async findSkillNode(id: string, db: Executor, forUpdate = false) {
    const query = db.select().from(schema.nodes).where(eq(schema.nodes.id, id));
    // NO KEY: loaders inserting links to this node (FK check) must not block on it.
    const [node] = forUpdate ? await query.for("no key update") : await query;
    if (!node) throw new NotFoundException(`Node ${id} not found`);
    if (node.type !== "SKILL") throw new BadRequestException("only SKILL aliases can be moved");
    return node;
  }

  // A typed name always means a new node; picking an existing one is explicit.
  private async createTarget(name: string, sourceId: string, movedAliases: string[], tx: Executor) {
    if (name.length === 0) throw new BadRequestException("target name must not be empty");
    const [existing] = await tx
      .select({ name: schema.nodes.canonicalName, status: schema.nodes.status })
      .from(schema.nodes)
      .where(
        and(
          eq(schema.nodes.type, "SKILL"),
          sql`lower(${schema.nodes.canonicalName}) = lower(${name})`,
        ),
      );
    if (existing) {
      // The target search lists VERIFIED nodes only.
      const hint =
        existing.status === "VERIFIED" ? "pick it from the list" : "verify it, then pick it";
      throw new BadRequestException(`"${existing.name}" already exists; ${hint}`);
    }

    // A new node must own its own spelling, or vacancies keep resolving it elsewhere.
    const selfAlias = normalizeAliasName(name);
    const [taken] = await tx
      .select({ nodeId: schema.nodeAliases.nodeId })
      .from(schema.nodeAliases)
      .where(and(eq(schema.nodeAliases.type, "SKILL"), eq(schema.nodeAliases.name, selfAlias)));
    if (taken && !movedAliases.includes(selfAlias)) {
      throw new BadRequestException(
        taken.nodeId === sourceId
          ? `"${name}" is spelled like alias "${selfAlias}" of this node; tick it too`
          : `"${name}" is already an alias of another skill; pick that skill instead`,
      );
    }

    const id = await this.nodes.insertReturningId("SKILL", name, tx);
    if (!id) throw new BadRequestException(`could not create node "${name}"`);
    const [created] = await tx
      .update(schema.nodes)
      .set({ status: "VERIFIED" })
      .where(eq(schema.nodes.id, id))
      .returning();
    if (!taken) await this.nodes.linkAlias(selfAlias, "SKILL", id, tx);
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
