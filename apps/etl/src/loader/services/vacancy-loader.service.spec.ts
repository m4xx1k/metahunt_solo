import { Test } from "@nestjs/testing";

import { DRIZZLE } from "@metahunt/database";

import { CompanyResolverService } from "./company-resolver.service";
import { NodeResolverService } from "./node-resolver.service";
import { VacancyLoaderService } from "./vacancy-loader.service";

const RECORD_ID = "33333333-3333-3333-3333-333333333333";
const SOURCE_ID = "11111111-1111-1111-1111-111111111111";
const VACANCY_ID = "vvvvvvvv-vvvv-vvvv-vvvv-vvvvvvvvvvvv";
const COMPANY_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const ROLE_NODE_ID = "rrrrrrrr-rrrr-rrrr-rrrr-rrrrrrrrrrrr";
const DOMAIN_NODE_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

const fullExtracted = {
  role: "Backend Engineer",
  seniority: "SENIOR",
  skills: {
    required: ["Go", "PostgreSQL"],
    optional: ["Docker"],
  },
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
  extractedData: fullExtracted,
};

type Mocks = {
  db: { select: jest.Mock; transaction: jest.Mock };
  tx: {
    insert: jest.Mock;
    delete: jest.Mock;
  };
  recordSelectWhere: jest.Mock;
  vacancyInsertReturning: jest.Mock;
  vacancyOnConflict: jest.Mock;
  vacancyValues: jest.Mock;
  txInsertCalls: { table: unknown; values: unknown }[];
  deleteWhere: jest.Mock;
  nodesInsertValues: jest.Mock;
};

function buildMocks(record: unknown): Mocks {
  const recordSelectWhere = jest.fn().mockResolvedValue(record ? [record] : []);
  const recordSelectFrom = jest
    .fn()
    .mockReturnValue({ where: recordSelectWhere });
  const select = jest.fn().mockReturnValue({ from: recordSelectFrom });

  // Inside the transaction:
  //   tx.insert(vacancies).values(...).onConflictDoUpdate(...).returning(...)
  //   tx.delete(vacancy_nodes).where(...)
  //   tx.insert(vacancy_nodes).values([...])
  const txInsertCalls: { table: unknown; values: unknown }[] = [];

  const vacancyInsertReturning = jest
    .fn()
    .mockResolvedValue([{ id: VACANCY_ID }]);
  const vacancyOnConflict = jest
    .fn()
    .mockReturnValue({ returning: vacancyInsertReturning });
  const vacancyValues = jest.fn(function (vals: unknown) {
    txInsertCalls.push({ table: "vacancies", values: vals });
    return { onConflictDoUpdate: vacancyOnConflict };
  });

  const nodesInsertValues = jest.fn(function (vals: unknown) {
    txInsertCalls.push({ table: "vacancy_nodes", values: vals });
    return Promise.resolve(undefined);
  });

  const txInsert = jest.fn((table: unknown) => {
    // First call -> vacancies (returning), subsequent -> vacancy_nodes
    if (txInsertCalls.length === 0) {
      return { values: vacancyValues };
    }
    return { values: nodesInsertValues };
  });

  const deleteWhere = jest.fn().mockResolvedValue(undefined);
  const txDelete = jest.fn().mockReturnValue({ where: deleteWhere });

  const tx = { insert: txInsert, delete: txDelete };
  const transaction = jest.fn(async (cb: (t: typeof tx) => Promise<unknown>) =>
    cb(tx),
  );

  return {
    db: { select, transaction },
    tx,
    recordSelectWhere,
    vacancyInsertReturning,
    vacancyOnConflict,
    vacancyValues,
    txInsertCalls,
    deleteWhere,
    nodesInsertValues,
  };
}

async function bootstrap(mocks: Mocks): Promise<{
  service: VacancyLoaderService;
  companyResolve: jest.Mock;
  nodeResolve: jest.Mock;
}> {
  const companyResolve = jest.fn();
  const nodeResolve = jest.fn();
  const moduleRef = await Test.createTestingModule({
    providers: [
      VacancyLoaderService,
      { provide: DRIZZLE, useValue: mocks.db },
      {
        provide: CompanyResolverService,
        useValue: { resolve: companyResolve },
      },
      { provide: NodeResolverService, useValue: { resolve: nodeResolve } },
    ],
  }).compile();
  return {
    service: moduleRef.get(VacancyLoaderService),
    companyResolve,
    nodeResolve,
  };
}

describe("VacancyLoaderService.loadFromRecord", () => {
  it("creates a vacancy from a full extracted payload", async () => {
    const mocks = buildMocks(baseRecord);
    const { service, companyResolve, nodeResolve } = await bootstrap(mocks);
    companyResolve.mockResolvedValue(COMPANY_ID);
    nodeResolve.mockImplementation((type: string, name: string) => {
      if (type === "ROLE") return Promise.resolve(ROLE_NODE_ID);
      if (type === "DOMAIN") return Promise.resolve(DOMAIN_NODE_ID);
      // skills: stable mapping per name
      return Promise.resolve(`skill:${name}`);
    });

    const result = await service.loadFromRecord(RECORD_ID);

    expect(result).toBe(VACANCY_ID);
    expect(companyResolve).toHaveBeenCalledWith(SOURCE_ID, "Acme Corp");
    expect(nodeResolve).toHaveBeenCalledWith("ROLE", "Backend Engineer");
    expect(nodeResolve).toHaveBeenCalledWith("DOMAIN", "FinTech");
    expect(nodeResolve).toHaveBeenCalledWith("SKILL", "Go");
    expect(nodeResolve).toHaveBeenCalledWith("SKILL", "PostgreSQL");
    expect(nodeResolve).toHaveBeenCalledWith("SKILL", "Docker");

    const vacancyArg = mocks.vacancyValues.mock.calls[0][0];
    expect(vacancyArg).toMatchObject({
      sourceId: SOURCE_ID,
      externalId: "100001",
      lastRssRecordId: RECORD_ID,
      title: "Senior Backend Engineer",
      description: "Long description here.",
      companyId: COMPANY_ID,
      roleNodeId: ROLE_NODE_ID,
      domainNodeId: DOMAIN_NODE_ID,
      seniority: "SENIOR",
      workFormat: "REMOTE",
      employmentType: "FULL_TIME",
      englishLevel: "UPPER_INTERMEDIATE",
      experienceYears: 3,
      salaryMin: 4000,
      salaryMax: 6000,
      currency: "USD",
      engagementType: "PRODUCT",
      hasTestAssignment: true,
      hasReservation: false,
    });
    expect(vacancyArg.locations).toEqual([
      { city: "Kyiv", country: "Ukraine" },
    ]);

    expect(mocks.deleteWhere).toHaveBeenCalledTimes(1);
    expect(mocks.nodesInsertValues).toHaveBeenCalledTimes(1);
    const skillsArg = mocks.nodesInsertValues.mock.calls[0][0] as Array<{
      vacancyId: string;
      nodeId: string;
      isRequired: boolean;
    }>;
    expect(skillsArg).toEqual([
      { vacancyId: VACANCY_ID, nodeId: "skill:Go", isRequired: true },
      { vacancyId: VACANCY_ID, nodeId: "skill:PostgreSQL", isRequired: true },
      { vacancyId: VACANCY_ID, nodeId: "skill:Docker", isRequired: false },
    ]);
  });

  it("skips company resolution when companyName is null", async () => {
    const record = {
      ...baseRecord,
      extractedData: { ...fullExtracted, companyName: null },
    };
    const mocks = buildMocks(record);
    const { service, companyResolve, nodeResolve } = await bootstrap(mocks);
    nodeResolve.mockImplementation((type: string, name: string) =>
      Promise.resolve(`${type}:${name}`),
    );

    await service.loadFromRecord(RECORD_ID);

    expect(companyResolve).not.toHaveBeenCalled();
    const vacancyArg = mocks.vacancyValues.mock.calls[0][0];
    expect(vacancyArg.companyId).toBeNull();
  });

  it("skips role/domain resolution when those fields are null", async () => {
    const record = {
      ...baseRecord,
      extractedData: {
        ...fullExtracted,
        role: null,
        domain: null,
      },
    };
    const mocks = buildMocks(record);
    const { service, companyResolve, nodeResolve } = await bootstrap(mocks);
    companyResolve.mockResolvedValue(COMPANY_ID);
    nodeResolve.mockImplementation((type: string, name: string) =>
      Promise.resolve(`${type}:${name}`),
    );

    await service.loadFromRecord(RECORD_ID);

    expect(nodeResolve).not.toHaveBeenCalledWith("ROLE", expect.anything());
    expect(nodeResolve).not.toHaveBeenCalledWith("DOMAIN", expect.anything());
    const vacancyArg = mocks.vacancyValues.mock.calls[0][0];
    expect(vacancyArg.roleNodeId).toBeNull();
    expect(vacancyArg.domainNodeId).toBeNull();
  });

  it("rewrites the skill set on update (delete then insert)", async () => {
    const mocks = buildMocks(baseRecord);
    const { service, companyResolve, nodeResolve } = await bootstrap(mocks);
    companyResolve.mockResolvedValue(COMPANY_ID);
    nodeResolve.mockImplementation((type: string, name: string) =>
      Promise.resolve(`${type}:${name}`),
    );

    await service.loadFromRecord(RECORD_ID);

    // delete must be called for vacancy_nodes BEFORE the second insert
    const insertOrder = mocks.txInsertCalls.map((c) => c.table);
    expect(insertOrder).toEqual(["vacancies", "vacancy_nodes"]);
    expect(mocks.deleteWhere).toHaveBeenCalledTimes(1);
    // Skills inserted after the delete
    const skillsCallOrder =
      mocks.nodesInsertValues.mock.invocationCallOrder[0];
    const deleteCallOrder = mocks.deleteWhere.mock.invocationCallOrder[0];
    expect(deleteCallOrder).toBeLessThan(skillsCallOrder);
  });

  it("handles empty skill set (delete still runs, no insert)", async () => {
    const record = {
      ...baseRecord,
      extractedData: {
        ...fullExtracted,
        skills: { required: [], optional: [] },
      },
    };
    const mocks = buildMocks(record);
    const { service, companyResolve, nodeResolve } = await bootstrap(mocks);
    companyResolve.mockResolvedValue(COMPANY_ID);
    nodeResolve.mockImplementation((type: string, name: string) =>
      Promise.resolve(`${type}:${name}`),
    );

    await service.loadFromRecord(RECORD_ID);

    expect(mocks.deleteWhere).toHaveBeenCalledTimes(1);
    expect(mocks.nodesInsertValues).not.toHaveBeenCalled();
  });

  it("throws when the rss_record is not found", async () => {
    const mocks = buildMocks(null);
    const { service } = await bootstrap(mocks);

    await expect(service.loadFromRecord(RECORD_ID)).rejects.toThrow(
      /rss_record/,
    );
  });
});
