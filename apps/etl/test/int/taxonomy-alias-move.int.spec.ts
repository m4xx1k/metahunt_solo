import { eq, sql } from "drizzle-orm";
import type { Pool } from "pg";

import { schema, type DrizzleDB } from "@metahunt/database";

import { DrizzleCompanyRepository } from "../../src/02-enrich/loader/repositories/company.repository";
import { DrizzleNodeRepository } from "../../src/02-enrich/loader/repositories/node.repository";
import { DrizzleVacancyRepository } from "../../src/02-enrich/loader/repositories/vacancy.repository";
import { CompanyResolverService } from "../../src/02-enrich/loader/services/company-resolver.service";
import { NodeResolverService } from "../../src/02-enrich/loader/services/node-resolver.service";
import { VacancyLoaderService } from "../../src/02-enrich/loader/services/vacancy-loader.service";
import { CandidateLoaderService } from "../../src/03-discovery/cv/candidate-loader.service";
import { FeedService } from "../../src/03-discovery/feed/feed.service";
import { RankingService } from "../../src/03-discovery/ranking/ranking.service";
import { TaxonomyAliasMoveService } from "../../src/admin/taxonomy/taxonomy-alias-move.service";

import { noopAnalytics } from "./analytics";
import { makeTestDb, truncateAll } from "./db";

let db: DrizzleDB;
let pool: Pool;
let loader: VacancyLoaderService;
let service: TaxonomyAliasMoveService;

const unusedExtractor = { extract: () => Promise.reject(new Error("not used")) };

function build(database: DrizzleDB) {
  const nodeRepo = new DrizzleNodeRepository(database);
  const vacancyLoader = new VacancyLoaderService(
    new DrizzleVacancyRepository(database),
    new CompanyResolverService(new DrizzleCompanyRepository(database)),
    new NodeResolverService(nodeRepo),
  );
  const candidateLoader = new CandidateLoaderService(
    database,
    unusedExtractor,
    new RankingService(database, new FeedService(database), noopAnalytics(database)),
  );
  return {
    loader: vacancyLoader,
    service: new TaxonomyAliasMoveService(database, vacancyLoader, candidateLoader, nodeRepo),
  };
}

async function seedNode(name: string, aliases: string[]): Promise<string> {
  const [node] = await db
    .insert(schema.nodes)
    .values({ type: "SKILL", canonicalName: name, status: "VERIFIED" })
    .returning({ id: schema.nodes.id });
  await db
    .insert(schema.nodeAliases)
    .values(aliases.map((name) => ({ name, type: "SKILL" as const, nodeId: node.id })));
  return node.id;
}

async function loadVacancies(skillSets: unknown[]): Promise<string[]> {
  const [source] = await db
    .insert(schema.sources)
    .values({ code: "dou", displayName: "DOU", baseUrl: "https://dou.ua" })
    .returning({ id: schema.sources.id });
  const [ingest] = await db
    .insert(schema.rssIngests)
    .values({ sourceId: source.id, triggeredBy: "test", startedAt: new Date() })
    .returning({ id: schema.rssIngests.id });
  const ids: string[] = [];
  for (const [i, skills] of skillSets.entries()) {
    const [record] = await db
      .insert(schema.rssRecords)
      .values({
        sourceId: source.id,
        rssIngestId: ingest.id,
        externalId: `ext-${i}`,
        hash: `hash-${i}`,
        publishedAt: new Date("2026-10-01T10:00:00.000Z"),
        title: `Vacancy ${i}`,
        extractedData: { skills },
      })
      .returning({ id: schema.rssRecords.id });
    const id = await loader.loadFromRecord(record.id);
    if (!id) throw new Error("vacancy not loaded");
    ids.push(id);
  }
  return ids;
}

async function seedCandidate(skills: string[], nodeIds: string[]): Promise<string> {
  const [cand] = await db
    .insert(schema.candidates)
    .values({
      contentHash: `hash-${skills.join(",")}`,
      sourceText: "",
      extracted: { skills: { required: skills, optional: [] }, unmatchedSkills: [] },
    })
    .returning({ id: schema.candidates.id });
  await db
    .insert(schema.candidateNodes)
    .values(nodeIds.map((nodeId) => ({ candidateId: cand.id, nodeId })));
  return cand.id;
}

const linkRows = () =>
  db.execute(sql`
    SELECT vacancy_id, node_id, is_required, requirement_group FROM vacancy_nodes
    UNION ALL
    SELECT candidate_id, node_id, NULL, NULL FROM candidate_nodes
    ORDER BY 1, 2
  `);

const vacancyLinks = async (vacancyId: string) =>
  (
    await db
      .select({
        name: schema.nodes.canonicalName,
        isRequired: schema.vacancyNodes.isRequired,
        group: schema.vacancyNodes.requirementGroup,
      })
      .from(schema.vacancyNodes)
      .innerJoin(schema.nodes, eq(schema.nodes.id, schema.vacancyNodes.nodeId))
      .where(eq(schema.vacancyNodes.vacancyId, vacancyId))
  ).sort((a, b) => a.name.localeCompare(b.name));

beforeAll(() => {
  ({ db, pool } = makeTestDb());
  ({ loader, service } = build(db));
});

afterAll(async () => {
  await pool.end();
});

afterEach(async () => {
  await truncateAll(db);
});

describe("TaxonomyAliasMoveService.moveAliases (integration)", () => {
  let dotnet: string;
  let docker: string;
  let vacancies: string[];
  let candidateBoth: string;
  let candidateCoreOnly: string;

  beforeEach(async () => {
    dotnet = await seedNode(".NET", ["net", "dotnet", "aspnetcore", "aspnet"]);
    docker = await seedNode("Docker", ["docker"]);
    vacancies = await loadVacancies([
      { required: [".NET", { anyOf: ["ASP.NET Core", "Node.js"] }], optional: ["Docker"] },
      { required: ["C#", "ASP.NET Core"], optional: [] },
      { required: [{ anyOf: [".NET"] }], optional: [] },
    ]);
    candidateBoth = await seedCandidate(["dotnet", "aspnetcore"], [dotnet, docker]);
    candidateCoreOnly = await seedCandidate(["aspnetcore"], [dotnet]);
  });

  const moveBody = (dryRun: boolean) => ({
    aliases: ["ASP.NET Core", "aspnet"],
    target: { name: "ASP.NET Core" },
    dryRun,
  });

  it("dry-run previews the diff and writes nothing", async () => {
    const before = await linkRows();

    const preview = await service.moveAliases(dotnet, moveBody(true));

    expect(preview.target.created).toBe(true);
    expect(preview.vacancies).toEqual({ scanned: 3, changed: 2, skipped: 0 });
    expect(preview.candidates).toEqual({ scanned: 2, changed: 2 });
    expect((await linkRows()).rows).toEqual(before.rows);
    const aspNodes = await db
      .select()
      .from(schema.nodes)
      .where(eq(schema.nodes.canonicalName, "ASP.NET Core"));
    expect(aspNodes).toHaveLength(0);
  });

  it("apply matches the dry-run and keeps anyOf groups", async () => {
    const preview = await service.moveAliases(dotnet, moveBody(true));
    const applied = await service.moveAliases(dotnet, moveBody(false));

    expect(applied.vacancies).toEqual(preview.vacancies);
    expect(applied.candidates).toEqual(preview.candidates);
    // The preview's target node was rolled back, so compare by name, not id.
    const byName = (links: typeof applied.links) => links.map((l) => ({ ...l, nodeId: l.name }));
    expect(byName(applied.links)).toEqual(byName(preview.links));

    expect(await vacancyLinks(vacancies[0])).toEqual([
      { name: ".NET", isRequired: true, group: null },
      { name: "ASP.NET Core", isRequired: true, group: 1 },
      { name: "Docker", isRequired: false, group: null },
      { name: "Node.js", isRequired: true, group: 1 },
    ]);
    expect((await vacancyLinks(vacancies[1])).map((l) => l.name)).toEqual(["ASP.NET Core", "C#"]);
    expect((await vacancyLinks(vacancies[2])).map((l) => l.name)).toEqual([".NET"]);

    const candNodes = async (id: string) =>
      (
        await db
          .select({ nodeId: schema.candidateNodes.nodeId })
          .from(schema.candidateNodes)
          .where(eq(schema.candidateNodes.candidateId, id))
      )
        .map((r) => r.nodeId)
        .sort();
    // Manual Docker confirm survives; .NET stays only where a skill still resolves to it.
    expect(await candNodes(candidateBoth)).toEqual([dotnet, docker, applied.target.id].sort());
    expect(await candNodes(candidateCoreOnly)).toEqual([applied.target.id]);
  });

  it("the reverse move restores the original links", async () => {
    const original = await linkRows();
    const applied = await service.moveAliases(dotnet, moveBody(false));

    await service.moveAliases(applied.target.id, {
      aliases: applied.aliases,
      target: { nodeId: dotnet },
    });

    expect((await linkRows()).rows).toEqual(original.rows);
  });

  it("skips records without usable extraction and keeps their links", async () => {
    const [vacancy] = await db
      .select({ recordId: schema.vacancies.lastRssRecordId })
      .from(schema.vacancies)
      .where(eq(schema.vacancies.id, vacancies[1]));
    await db
      .update(schema.rssRecords)
      .set({ extractedData: null })
      .where(eq(schema.rssRecords.id, vacancy.recordId));

    const applied = await service.moveAliases(dotnet, moveBody(false));

    expect(applied.vacancies).toEqual({ scanned: 3, changed: 1, skipped: 1 });
    expect((await vacancyLinks(vacancies[1])).map((l) => l.name)).toEqual([".NET", "C#"]);
  });

  it("keeps a CV's hand-confirmed source link when no CV skill moved", async () => {
    const manual = await seedCandidate(["Docker"], [docker, dotnet]);

    await service.moveAliases(dotnet, moveBody(false));

    const links = await db
      .select({ nodeId: schema.candidateNodes.nodeId })
      .from(schema.candidateNodes)
      .where(eq(schema.candidateNodes.candidateId, manual));
    expect(links.map((l) => l.nodeId).sort()).toEqual([dotnet, docker].sort());
  });

  it("rejects a hidden target, an existing name typed as new, a foreign self-alias, and moving the node's own name alone", async () => {
    const hidden = await seedNode("Legacy", ["legacy"]);
    await db.update(schema.nodes).set({ status: "HIDDEN" }).where(eq(schema.nodes.id, hidden));

    await expect(
      service.moveAliases(dotnet, { aliases: ["aspnet"], target: { nodeId: hidden } }),
    ).rejects.toThrow("is hidden");
    await expect(
      service.moveAliases(dotnet, { aliases: ["aspnet"], target: { name: "docker" } }),
    ).rejects.toThrow('"Docker" already exists');
    await expect(
      service.moveAliases(dotnet, { aliases: ["dotnet"], target: { name: "ASP.NET Core" } }),
    ).rejects.toThrow('move "aspnetcore" too');
    await expect(
      service.moveAliases(dotnet, { aliases: ["net"], target: { name: "Dot Net" } }),
    ).rejects.toThrow("own name moves only together with all aliases");
  });

  it("a failure while relinking rolls back the alias move too", async () => {
    const aliasesBefore = await db
      .select()
      .from(schema.nodeAliases)
      .orderBy(schema.nodeAliases.name);
    const linksBefore = await linkRows();
    const failingCvs = { relinkSkills: () => Promise.reject(new Error("boom")) };
    const failing = new TaxonomyAliasMoveService(
      db,
      loader,
      failingCvs as unknown as CandidateLoaderService,
      new DrizzleNodeRepository(db),
    );

    await expect(failing.moveAliases(dotnet, moveBody(false))).rejects.toThrow("boom");

    expect(await db.select().from(schema.nodeAliases).orderBy(schema.nodeAliases.name)).toEqual(
      aliasesBefore,
    );
    expect((await linkRows()).rows).toEqual(linksBefore.rows);
  });

  it("rejects aliases the source does not own", async () => {
    await expect(
      service.moveAliases(dotnet, { aliases: ["docker"], target: { name: "Docker 2" } }),
    ).rejects.toThrow("not aliases of this node: docker");
  });
});
