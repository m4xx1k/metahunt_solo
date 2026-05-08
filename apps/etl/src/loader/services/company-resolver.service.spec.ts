import { Test } from "@nestjs/testing";

import { DRIZZLE } from "@metahunt/database";

import { CompanyResolverService } from "./company-resolver.service";

const SOURCE_ID = "11111111-1111-1111-1111-111111111111";
const COMPANY_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const EXISTING_COMPANY_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

type Mocks = {
  db: { select: jest.Mock; insert: jest.Mock };
  selectWhere: jest.Mock;
  insertReturning: jest.Mock;
  insertOnConflictNoReturn: jest.Mock;
  insertOnConflictWithReturn: jest.Mock;
  insertValues: jest.Mock;
};

function buildMocks(opts: {
  identifierHits: { companyId: string }[];
  slugHits: { id: string }[];
  companyInsertReturned: { id: string }[];
}): Mocks {
  // The order of selectWhere calls in the resolver is fixed:
  //   1. company_identifiers WHERE (source_id, source_company_name) = ...
  //   2. companies WHERE slug = ...                          (only on identifier miss)
  const selectWhere = jest
    .fn()
    .mockResolvedValueOnce(opts.identifierHits)
    .mockResolvedValueOnce(opts.slugHits);
  const selectFrom = jest.fn().mockReturnValue({ where: selectWhere });
  const select = jest.fn().mockReturnValue({ from: selectFrom });

  // The resolver may insert: companies (with returning) and/or
  // company_identifiers (no returning). Set up both shapes; only the
  // ones used will be observed.
  const insertReturning = jest
    .fn()
    .mockResolvedValue(opts.companyInsertReturned);
  const insertOnConflictWithReturn = jest
    .fn()
    .mockReturnValue({ returning: insertReturning });
  const insertOnConflictNoReturn = jest.fn().mockResolvedValue(undefined);

  // First insert call may be companies (returning) OR identifiers (no returning).
  // We give each call its own onConflict shape based on call order:
  //  - full create: companies (returning) -> identifier (no returning)
  //  - slug-hit:    identifier (no returning) only
  const insertValues = jest
    .fn()
    .mockReturnValueOnce({ onConflictDoNothing: insertOnConflictWithReturn })
    .mockReturnValueOnce({ onConflictDoNothing: insertOnConflictNoReturn });
  const insert = jest.fn().mockReturnValue({ values: insertValues });

  return {
    db: { select, insert },
    selectWhere,
    insertReturning,
    insertOnConflictNoReturn,
    insertOnConflictWithReturn,
    insertValues,
  };
}

async function bootstrap(mocks: Mocks): Promise<CompanyResolverService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      CompanyResolverService,
      { provide: DRIZZLE, useValue: mocks.db },
    ],
  }).compile();
  return moduleRef.get(CompanyResolverService);
}

describe("CompanyResolverService.resolve", () => {
  it("returns existing company id on company_identifiers hit (no inserts)", async () => {
    const mocks = buildMocks({
      identifierHits: [{ companyId: EXISTING_COMPANY_ID }],
      slugHits: [],
      companyInsertReturned: [],
    });
    const svc = await bootstrap(mocks);

    const result = await svc.resolve(SOURCE_ID, "Acme Corp");

    expect(result).toBe(EXISTING_COMPANY_ID);
    expect(mocks.db.insert).not.toHaveBeenCalled();
    expect(mocks.selectWhere).toHaveBeenCalledTimes(1);
  });

  it("links existing slug-matched company on identifier miss", async () => {
    // Slug-hit path: insert order is identifier-only (no companies insert)
    const mocks: Mocks = (() => {
      const selectWhere = jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: EXISTING_COMPANY_ID }]);
      const selectFrom = jest.fn().mockReturnValue({ where: selectWhere });
      const select = jest.fn().mockReturnValue({ from: selectFrom });

      const insertOnConflictNoReturn = jest.fn().mockResolvedValue(undefined);
      const insertValues = jest
        .fn()
        .mockReturnValue({ onConflictDoNothing: insertOnConflictNoReturn });
      const insert = jest.fn().mockReturnValue({ values: insertValues });

      return {
        db: { select, insert },
        selectWhere,
        insertReturning: jest.fn(),
        insertOnConflictNoReturn,
        insertOnConflictWithReturn: jest.fn(),
        insertValues,
      };
    })();
    const svc = await bootstrap(mocks);

    const result = await svc.resolve(SOURCE_ID, "Acme Corp");

    expect(result).toBe(EXISTING_COMPANY_ID);
    expect(mocks.db.insert).toHaveBeenCalledTimes(1); // only the identifier insert
    const idArg = mocks.insertValues.mock.calls[0][0];
    expect(idArg).toMatchObject({
      sourceId: SOURCE_ID,
      sourceCompanyName: "Acme Corp",
      companyId: EXISTING_COMPANY_ID,
    });
  });

  it("creates company + identifier when both are missing", async () => {
    const mocks = buildMocks({
      identifierHits: [],
      slugHits: [],
      companyInsertReturned: [{ id: COMPANY_ID }],
    });
    const svc = await bootstrap(mocks);

    const result = await svc.resolve(SOURCE_ID, "Acme Corp");

    expect(result).toBe(COMPANY_ID);
    expect(mocks.db.insert).toHaveBeenCalledTimes(2);
    const companyArg = mocks.insertValues.mock.calls[0][0];
    expect(companyArg).toMatchObject({
      name: "Acme Corp",
      slug: "acme-corp",
    });
    const idArg = mocks.insertValues.mock.calls[1][0];
    expect(idArg).toMatchObject({
      sourceId: SOURCE_ID,
      sourceCompanyName: "Acme Corp",
      companyId: COMPANY_ID,
    });
  });

  it("slugifies the name (lowercase, hyphens, strips punctuation)", async () => {
    const mocks = buildMocks({
      identifierHits: [],
      slugHits: [],
      companyInsertReturned: [{ id: COMPANY_ID }],
    });
    const svc = await bootstrap(mocks);

    await svc.resolve(SOURCE_ID, "  Hello World, Inc!  ");

    const companyArg = mocks.insertValues.mock.calls[0][0];
    expect(companyArg.slug).toBe("hello-world-inc");
    expect(companyArg.name).toBe("Hello World, Inc!");
  });
});
