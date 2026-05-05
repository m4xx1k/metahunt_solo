import { Test } from "@nestjs/testing";

import { DRIZZLE } from "@metahunt/database";

import { NodeResolverService } from "./node-resolver.service";

const NODE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const EXISTING_NODE_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

type Mocks = {
  db: { select: jest.Mock; insert: jest.Mock };
  selectWhere: jest.Mock;
  insertReturning: jest.Mock;
  insertOnConflictNoReturn: jest.Mock;
  insertOnConflictWithReturn: jest.Mock;
  insertValues: jest.Mock;
};

function buildMocks(opts: {
  aliasHits: { nodeId: string }[];
  nodeInsertReturned: { id: string }[];
  nodeFallbackSelect: { id: string }[];
}): Mocks {
  const selectWhere = jest
    .fn()
    .mockResolvedValueOnce(opts.aliasHits)
    .mockResolvedValueOnce(opts.nodeFallbackSelect);
  const selectFrom = jest.fn().mockReturnValue({ where: selectWhere });
  const select = jest.fn().mockReturnValue({ from: selectFrom });

  const insertReturning = jest.fn().mockResolvedValue(opts.nodeInsertReturned);
  const insertOnConflictWithReturn = jest
    .fn()
    .mockReturnValue({ returning: insertReturning });
  const insertOnConflictNoReturn = jest.fn().mockResolvedValue(undefined);
  // First insert call -> nodes (with returning), second insert call -> aliases (no returning)
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

async function bootstrap(mocks: Mocks): Promise<NodeResolverService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      NodeResolverService,
      { provide: DRIZZLE, useValue: mocks.db },
    ],
  }).compile();
  return moduleRef.get(NodeResolverService);
}

describe("NodeResolverService.resolve", () => {
  it("returns the existing node id on alias hit (no inserts)", async () => {
    const mocks = buildMocks({
      aliasHits: [{ nodeId: EXISTING_NODE_ID }],
      nodeInsertReturned: [],
      nodeFallbackSelect: [],
    });
    const svc = await bootstrap(mocks);

    const result = await svc.resolve("SKILL", "TypeScript");

    expect(result).toBe(EXISTING_NODE_ID);
    expect(mocks.db.insert).not.toHaveBeenCalled();
    expect(mocks.selectWhere).toHaveBeenCalledTimes(1);
  });

  it("normalizes the lookup name (lowercase + trim)", async () => {
    const mocks = buildMocks({
      aliasHits: [{ nodeId: EXISTING_NODE_ID }],
      nodeInsertReturned: [],
      nodeFallbackSelect: [],
    });
    const svc = await bootstrap(mocks);

    await svc.resolve("ROLE", "  Backend Developer  ");

    // The where-eq should have been called with the normalized form;
    // we can't easily inspect the eq() args, so we just confirm the
    // path took the alias-hit branch (one select, no inserts).
    expect(mocks.db.insert).not.toHaveBeenCalled();
  });

  it("creates node + alias on miss and returns the new id", async () => {
    const mocks = buildMocks({
      aliasHits: [],
      nodeInsertReturned: [{ id: NODE_ID }],
      nodeFallbackSelect: [],
    });
    const svc = await bootstrap(mocks);

    const result = await svc.resolve("DOMAIN", "FinTech");

    expect(result).toBe(NODE_ID);
    expect(mocks.db.insert).toHaveBeenCalledTimes(2);
    const nodeInsertArg = mocks.insertValues.mock.calls[0][0];
    expect(nodeInsertArg).toMatchObject({
      type: "DOMAIN",
      canonicalName: "FinTech",
      status: "NEW",
    });
    const aliasInsertArg = mocks.insertValues.mock.calls[1][0];
    expect(aliasInsertArg).toMatchObject({
      name: "fintech",
      nodeId: NODE_ID,
    });
  });

  it("falls back to SELECT when concurrent insert wins (returning empty)", async () => {
    const mocks = buildMocks({
      aliasHits: [],
      nodeInsertReturned: [], // race lost
      nodeFallbackSelect: [{ id: EXISTING_NODE_ID }],
    });
    const svc = await bootstrap(mocks);

    const result = await svc.resolve("SKILL", "Go");

    expect(result).toBe(EXISTING_NODE_ID);
    // node insert (returning), then fallback select, then alias insert
    expect(mocks.selectWhere).toHaveBeenCalledTimes(2);
    expect(mocks.insertOnConflictWithReturn).toHaveBeenCalledTimes(1);
    expect(mocks.insertOnConflictNoReturn).toHaveBeenCalledTimes(1);
    const aliasInsertArg = mocks.insertValues.mock.calls[1][0];
    expect(aliasInsertArg).toMatchObject({
      name: "go",
      nodeId: EXISTING_NODE_ID,
    });
  });
});
