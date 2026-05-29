import { VacancyLoaderService } from "./vacancy-loader.service";
import { CompanyResolverService } from "./company-resolver.service";
import { NodeResolverService } from "./node-resolver.service";
import type { Executor } from "../repositories/executor";
import {
  VacancyRepository,
  type SkillLink,
  type VacancyUpsertValues,
} from "../repositories/vacancy.repository";

const RECORD_ID = "33333333-3333-3333-3333-333333333333";
const SOURCE_ID = "11111111-1111-1111-1111-111111111111";
const VACANCY_ID = "vvvvvvvv-vvvv-vvvv-vvvv-vvvvvvvvvvvv";
const COMPANY_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const ROLE_NODE_ID = "rrrrrrrr-rrrr-rrrr-rrrr-rrrrrrrrrrrr";
const DOMAIN_NODE_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const PUBLISHED_AT = new Date("2026-04-24T10:00:00.000Z");
// Sentinel tx handed to runInTransaction's callback — asserts resolution and
// the upsert all run on the SAME executor (one atomic unit of work).
const TX = { __tx: true } as unknown as Executor;

const fullExtracted = {
  role: "Backend Engineer",
  seniority: "SENIOR",
  skills: { required: ["Go", "PostgreSQL"], optional: ["Docker"] },
  experienceYears: 3,
  salary: { min: 4000, max: 6000, currency: "USD" },
  englishLevel: "UPPER_INTERMEDIATE",
  employmentType: "FULL_TIME",
  workFormat: "REMOTE",
  locations: [{ city: "Kyiv", country: "Ukraine" }],
  domain: "FinTech",
  engagementType: "PRODUCT",
  companyName: "Acme Corp",
  hasTestAssignment: true,
  hasReservation: false,
};

const baseRecord = {
  id: RECORD_ID,
  sourceId: SOURCE_ID,
  externalId: "100001",
  title: "Senior Backend Engineer",
  description: "Long description here.",
  publishedAt: PUBLISHED_AT,
  extractedData: fullExtracted,
};

// The repository boundary makes the loader unit-testable with no DB and no tx
// chain to fake — runInTransaction just runs the callback with a sentinel tx.
function makeRepo(): jest.Mocked<VacancyRepository> {
  return {
    runInTransaction: jest.fn((work: (tx: Executor) => Promise<unknown>) =>
      work(TX),
    ),
    findRecord: jest.fn().mockResolvedValue(null),
    upsertWithSkills: jest.fn().mockResolvedValue(VACANCY_ID),
  } as unknown as jest.Mocked<VacancyRepository>;
}

function makeService(repo: VacancyRepository) {
  const companyResolve = jest.fn();
  const nodeResolve = jest.fn();
  const service = new VacancyLoaderService(
    repo,
    { resolve: companyResolve } as unknown as CompanyResolverService,
    { resolve: nodeResolve } as unknown as NodeResolverService,
  );
  return { service, companyResolve, nodeResolve };
}

function valuesArg(repo: jest.Mocked<VacancyRepository>): VacancyUpsertValues {
  return repo.upsertWithSkills.mock.calls[0][0];
}
function skillsArg(repo: jest.Mocked<VacancyRepository>): SkillLink[] {
  return repo.upsertWithSkills.mock.calls[0][1];
}

describe("VacancyLoaderService.loadFromRecord", () => {
  it("maps a full payload and runs resolution + upsert on one tx", async () => {
    const repo = makeRepo();
    repo.findRecord.mockResolvedValue(baseRecord as never);
    const { service, companyResolve, nodeResolve } = makeService(repo);
    companyResolve.mockResolvedValue(COMPANY_ID);
    nodeResolve.mockImplementation((type: string, name: string) => {
      if (type === "ROLE") return Promise.resolve(ROLE_NODE_ID);
      if (type === "DOMAIN") return Promise.resolve(DOMAIN_NODE_ID);
      return Promise.resolve(`skill:${name}`);
    });

    const result = await service.loadFromRecord(RECORD_ID);

    expect(result).toBe(VACANCY_ID);
    // every write joins the same transaction
    expect(repo.runInTransaction).toHaveBeenCalledTimes(1);
    expect(companyResolve).toHaveBeenCalledWith(SOURCE_ID, "Acme Corp", TX);
    expect(nodeResolve).toHaveBeenCalledWith("ROLE", "Backend Engineer", TX);
    expect(nodeResolve).toHaveBeenCalledWith("DOMAIN", "FinTech", TX);
    expect(nodeResolve).toHaveBeenCalledWith("SKILL", "Go", TX);
    expect(repo.upsertWithSkills).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      TX,
    );

    expect(valuesArg(repo)).toMatchObject({
      sourceId: SOURCE_ID,
      externalId: "100001",
      lastRssRecordId: RECORD_ID,
      title: "Senior Backend Engineer",
      description: "Long description here.",
      companyId: COMPANY_ID,
      roleNodeId: ROLE_NODE_ID,
      domainNodeId: DOMAIN_NODE_ID,
      seniority: "SENIOR",
      experienceYears: 3,
      salaryMin: 4000,
      salaryMax: 6000,
      currency: "USD",
      hasTestAssignment: true,
      hasReservation: false,
      publishedAt: PUBLISHED_AT,
    });
    expect(valuesArg(repo).locations).toEqual([
      { city: "Kyiv", country: "Ukraine" },
    ]);

    // required wins; dedup by node; ordering required-then-optional.
    expect(skillsArg(repo)).toEqual([
      { nodeId: "skill:Go", isRequired: true },
      { nodeId: "skill:PostgreSQL", isRequired: true },
      { nodeId: "skill:Docker", isRequired: false },
    ]);
  });

  it("required wins when a skill is both required and optional", async () => {
    const repo = makeRepo();
    repo.findRecord.mockResolvedValue({
      ...baseRecord,
      extractedData: {
        ...fullExtracted,
        skills: { required: ["Go"], optional: ["Go", "Docker"] },
      },
    } as never);
    const { service, companyResolve, nodeResolve } = makeService(repo);
    companyResolve.mockResolvedValue(COMPANY_ID);
    nodeResolve.mockImplementation((_type: string, name: string) =>
      Promise.resolve(`skill:${name}`),
    );

    await service.loadFromRecord(RECORD_ID);

    expect(skillsArg(repo)).toEqual([
      { nodeId: "skill:Go", isRequired: true },
      { nodeId: "skill:Docker", isRequired: false },
    ]);
  });

  it("skips company resolution when companyName is null", async () => {
    const repo = makeRepo();
    repo.findRecord.mockResolvedValue({
      ...baseRecord,
      extractedData: { ...fullExtracted, companyName: null },
    } as never);
    const { service, companyResolve, nodeResolve } = makeService(repo);
    nodeResolve.mockResolvedValue("node");

    await service.loadFromRecord(RECORD_ID);

    expect(companyResolve).not.toHaveBeenCalled();
    expect(valuesArg(repo).companyId).toBeNull();
  });

  it("skips role/domain resolution when those fields are null", async () => {
    const repo = makeRepo();
    repo.findRecord.mockResolvedValue({
      ...baseRecord,
      extractedData: { ...fullExtracted, role: null, domain: null },
    } as never);
    const { service, companyResolve, nodeResolve } = makeService(repo);
    companyResolve.mockResolvedValue(COMPANY_ID);
    nodeResolve.mockResolvedValue("skill");

    await service.loadFromRecord(RECORD_ID);

    expect(nodeResolve).not.toHaveBeenCalledWith(
      "ROLE",
      expect.anything(),
      expect.anything(),
    );
    expect(nodeResolve).not.toHaveBeenCalledWith(
      "DOMAIN",
      expect.anything(),
      expect.anything(),
    );
    expect(valuesArg(repo).roleNodeId).toBeNull();
    expect(valuesArg(repo).domainNodeId).toBeNull();
  });

  it("passes an empty skill-link list when there are no skills", async () => {
    const repo = makeRepo();
    repo.findRecord.mockResolvedValue({
      ...baseRecord,
      extractedData: { ...fullExtracted, skills: { required: [], optional: [] } },
    } as never);
    const { service, companyResolve, nodeResolve } = makeService(repo);
    companyResolve.mockResolvedValue(COMPANY_ID);
    nodeResolve.mockResolvedValue("node");

    await service.loadFromRecord(RECORD_ID);

    expect(skillsArg(repo)).toEqual([]);
  });

  it("throws before opening a transaction when the rss_record is missing", async () => {
    const repo = makeRepo();
    repo.findRecord.mockResolvedValue(null);
    const { service } = makeService(repo);

    await expect(service.loadFromRecord(RECORD_ID)).rejects.toThrow(
      /rss_record/,
    );
    expect(repo.runInTransaction).not.toHaveBeenCalled();
    expect(repo.upsertWithSkills).not.toHaveBeenCalled();
  });
});
