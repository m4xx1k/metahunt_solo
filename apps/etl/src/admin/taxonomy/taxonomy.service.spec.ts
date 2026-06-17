import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";

import { DRIZZLE, schema } from "@metahunt/database";

import { TaxonomyService } from "./taxonomy.service";

type Row = Record<string, unknown>;

type DbMock = {
  execute: jest.Mock;
  transaction: jest.Mock;
  select: jest.Mock;
  update: jest.Mock;
};

function emptyDbMock(): DbMock {
  return {
    execute: jest.fn(),
    transaction: jest.fn(),
    select: jest.fn(),
    update: jest.fn(),
  };
}

async function bootstrap(db: DbMock): Promise<TaxonomyService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      TaxonomyService,
      { provide: DRIZZLE, useValue: db },
    ],
  }).compile();
  return moduleRef.get(TaxonomyService);
}

describe("TaxonomyService", () => {
  describe("listNodes", () => {
    it("maps rows into camelCase items with numeric counts and total", async () => {
      const db = emptyDbMock();
      const rows: Row[] = [
        {
          id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          type: "SKILL",
          canonical_name: "react",
          status: "VERIFIED",
          vacancies_blocked: "10",
          alias_count: "2",
          total: "3",
        },
        {
          id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          type: "SKILL",
          canonical_name: "node.js",
          status: "NEW",
          vacancies_blocked: "4",
          alias_count: "0",
          total: "3",
        },
      ];
      db.execute.mockResolvedValue({ rows });

      const svc = await bootstrap(db);
      const result = await svc.listNodes({
        type: "SKILL",
        statuses: ["NEW", "VERIFIED"],
        minBlocked: 0,
        page: 1,
        pageSize: 50,
      });

      expect(result.total).toBe(3);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(50);
      expect(result.items).toEqual([
        {
          id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          type: "SKILL",
          canonicalName: "react",
          status: "VERIFIED",
          vacanciesBlocked: 10,
          aliasCount: 2,
        },
        {
          id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          type: "SKILL",
          canonicalName: "node.js",
          status: "NEW",
          vacanciesBlocked: 4,
          aliasCount: 0,
        },
      ]);
    });

    it("reports total=0 on empty result", async () => {
      const db = emptyDbMock();
      db.execute.mockResolvedValue({ rows: [] });
      const svc = await bootstrap(db);

      const result = await svc.listNodes({
        type: "ROLE",
        statuses: ["HIDDEN"],
        minBlocked: 5,
        page: 1,
        pageSize: 50,
      });

      expect(result.total).toBe(0);
      expect(result.items).toEqual([]);
    });

    it("runs the same single SQL whether type / q / minBlocked are set or not", async () => {
      // The SQL is one big CTE — we don't want to assert on its text, but we
      // do want to know we're not falling into a branch that issues extra
      // queries. So we just count the .execute() calls across two shapes.
      const db = emptyDbMock();
      db.execute.mockResolvedValue({ rows: [] });
      const svc = await bootstrap(db);

      await svc.listNodes({
        statuses: ["NEW", "VERIFIED"],
        minBlocked: 0,
        page: 1,
        pageSize: 50,
      });
      await svc.listNodes({
        type: "DOMAIN",
        statuses: ["VERIFIED"],
        q: "back",
        minBlocked: 2,
        page: 2,
        pageSize: 25,
      });

      expect(db.execute).toHaveBeenCalledTimes(2);
    });
  });

  describe("renameNode", () => {
    const NODE_ID = "11111111-1111-1111-1111-111111111111";
    const OTHER_ID = "22222222-2222-2222-2222-222222222222";

    type TxMock = {
      select: jest.Mock;
      update: jest.Mock;
      execute: jest.Mock;
    };

    function buildTx(opts: {
      node?: { id: string; canonicalName: string; type: string; status: string } | null;
      conflictRows?: Row[];
      updated?: { id: string; canonicalName: string; type: string; status: string };
    }): TxMock {
      // tx.select().from(...).where(...) → resolves to [node] or []
      const selectWhere = jest.fn().mockResolvedValue(opts.node ? [opts.node] : []);
      const selectFrom = jest.fn().mockReturnValue({ where: selectWhere });
      const select = jest.fn().mockReturnValue({ from: selectFrom });

      // tx.execute(): called for conflicts probe, then alias cleanup, then alias insert.
      // Tests can provide conflictRows for the first call; later calls just resolve.
      const execute = jest
        .fn()
        .mockResolvedValueOnce({ rows: opts.conflictRows ?? [] })
        .mockResolvedValue(undefined);

      // tx.update().set().where().returning()
      const updateReturning = jest
        .fn()
        .mockResolvedValue(opts.updated ? [opts.updated] : []);
      const updateWhere = jest.fn().mockReturnValue({ returning: updateReturning });
      const updateSet = jest.fn().mockReturnValue({ where: updateWhere });
      const update = jest.fn().mockReturnValue({ set: updateSet });

      return { select, update, execute };
    }

    function wireTx(db: DbMock, tx: TxMock): void {
      db.transaction.mockImplementation(async (fn: (t: TxMock) => Promise<unknown>) => fn(tx));
    }

    it("renames a node, promoting the old canonical to an alias", async () => {
      const db = emptyDbMock();
      const tx = buildTx({
        node: {
          id: NODE_ID,
          canonicalName: "Backend Eng",
          type: "ROLE",
          status: "NEW",
        },
        updated: {
          id: NODE_ID,
          canonicalName: "Backend Engineer",
          type: "ROLE",
          status: "NEW",
        },
      });
      wireTx(db, tx);
      const svc = await bootstrap(db);

      const out = await svc.renameNode(NODE_ID, "  Backend Engineer  ");

      expect(out).toEqual({
        id: NODE_ID,
        canonicalName: "Backend Engineer",
        type: "ROLE",
        status: "NEW",
      });
      // 2 execute calls in the happy path: conflicts probe, then the combined
      // (old + new canonical) lowercased alias insert.
      expect(tx.execute).toHaveBeenCalledTimes(2);
      expect(tx.update).toHaveBeenCalledTimes(1);
    });

    it("rejects names shorter than the minimum without touching the DB", async () => {
      const db = emptyDbMock();
      const svc = await bootstrap(db);

      await expect(svc.renameNode(NODE_ID, " a ")).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it("rejects names equal to the current canonical", async () => {
      const db = emptyDbMock();
      const tx = buildTx({
        node: {
          id: NODE_ID,
          canonicalName: "React",
          type: "SKILL",
          status: "VERIFIED",
        },
      });
      wireTx(db, tx);
      const svc = await bootstrap(db);

      await expect(svc.renameNode(NODE_ID, "React")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("404s when the node id is unknown", async () => {
      const db = emptyDbMock();
      const tx = buildTx({ node: null });
      wireTx(db, tx);
      const svc = await bootstrap(db);

      await expect(svc.renameNode(NODE_ID, "Anything")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("surfaces a canonical-of-other conflict with mergeTargetId suggestion", async () => {
      const node = {
        id: NODE_ID,
        canonicalName: "Backend Eng",
        type: "ROLE",
        status: "NEW",
      };
      const conflictRows = [{ id: OTHER_ID, source: "canonical" }];

      // Run twice with fresh mocks so the assertions don't share state.
      const dbA = emptyDbMock();
      wireTx(dbA, buildTx({ node, conflictRows }));
      const svcA = await bootstrap(dbA);
      await expect(svcA.renameNode(NODE_ID, "Backend Engineer")).rejects.toMatchObject({
        response: {
          message: expect.stringContaining("canonical"),
          suggestion: { mergeTargetId: OTHER_ID },
        },
      });

      const dbB = emptyDbMock();
      wireTx(dbB, buildTx({ node, conflictRows }));
      const svcB = await bootstrap(dbB);
      // It really is a ConflictException so the HTTP layer maps to 409.
      await expect(svcB.renameNode(NODE_ID, "Backend Engineer")).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it("surfaces an alias-of-other conflict with mergeTargetId suggestion", async () => {
      const db = emptyDbMock();
      const tx = buildTx({
        node: {
          id: NODE_ID,
          canonicalName: "Backend Eng",
          type: "ROLE",
          status: "NEW",
        },
        conflictRows: [{ id: OTHER_ID, source: "alias" }],
      });
      wireTx(db, tx);
      const svc = await bootstrap(db);

      await expect(
        svc.renameNode(NODE_ID, "Backend Engineer"),
      ).rejects.toMatchObject({
        response: {
          message: expect.stringContaining("alias"),
          suggestion: { mergeTargetId: OTHER_ID },
        },
      });
    });
  });

  describe("mergeInto", () => {
    const SRC = "33333333-3333-3333-3333-333333333333";
    const DST = "44444444-4444-4444-4444-444444444444";

    function buildMergeTx(source: Row, target: Row) {
      const selectWhere = jest.fn().mockResolvedValue([source, target]);
      const select = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({ where: selectWhere }),
      });
      const execute = jest.fn().mockResolvedValue(undefined);
      const update = jest.fn().mockReturnValue({
        set: jest
          .fn()
          .mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
      });
      const del = jest
        .fn()
        .mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) });
      return { select, execute, update, delete: del };
    }

    function wireMergeTx(db: DbMock, tx: ReturnType<typeof buildMergeTx>): void {
      db.transaction.mockImplementation(
        async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
      );
    }

    it("rejects merging a node into itself without touching the DB", async () => {
      const db = emptyDbMock();
      const svc = await bootstrap(db);
      await expect(svc.mergeInto(SRC, SRC)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it("rejects merging across node types", async () => {
      const db = emptyDbMock();
      const tx = buildMergeTx(
        { id: SRC, canonicalName: "x", type: "SKILL", status: "NEW" },
        { id: DST, canonicalName: "y", type: "ROLE", status: "VERIFIED" },
      );
      wireMergeTx(db, tx);
      const svc = await bootstrap(db);
      await expect(svc.mergeInto(SRC, DST)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("repoints candidate_nodes (CV skill links) onto the target", async () => {
      const db = emptyDbMock();
      const tx = buildMergeTx(
        { id: SRC, canonicalName: "React.js", type: "SKILL", status: "NEW" },
        { id: DST, canonicalName: "React", type: "SKILL", status: "VERIFIED" },
      );
      wireMergeTx(db, tx);
      const svc = await bootstrap(db);

      const out = await svc.mergeInto(SRC, DST);

      expect(out).toEqual({ mergedInto: DST, source: "React.js", target: "React" });
      // candidate_nodes must be repointed alongside vacancy_nodes — else the
      // final node delete trips the candidate_nodes FK and aborts the merge for
      // any skill a CV has already matched.
      const updatedTables = tx.update.mock.calls.map((c) => c[0]);
      expect(updatedTables).toContain(schema.candidateNodes);
      expect(updatedTables).toContain(schema.vacancyNodes);
    });
  });

});
