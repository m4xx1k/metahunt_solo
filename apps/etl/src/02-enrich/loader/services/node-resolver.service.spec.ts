import { NodeResolverService } from "./node-resolver.service";
import { NodeRepository } from "../repositories/node.repository";
import type { Executor } from "../repositories/executor";

const NODE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const EXISTING_NODE_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
// Sentinel transaction handle — asserts the resolver threads it through.
const TX = { __tx: true } as unknown as Executor;

// Mock the repository boundary, not the Drizzle chain — lets us assert that
// names are normalized/trimmed before they reach the DB layer.
function makeRepo(): jest.Mocked<NodeRepository> {
  return {
    findIdByAlias: jest.fn().mockResolvedValue(null),
    insertReturningId: jest.fn().mockResolvedValue(null),
    findIdByCanonical: jest.fn().mockResolvedValue(null),
    linkAlias: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<NodeRepository>;
}

describe("NodeResolverService.resolve", () => {
  it("returns the existing node id on alias hit (no inserts)", async () => {
    const repo = makeRepo();
    repo.findIdByAlias.mockResolvedValue(EXISTING_NODE_ID);
    const svc = new NodeResolverService(repo);

    const result = await svc.resolve("SKILL", "TypeScript", TX);

    expect(result).toBe(EXISTING_NODE_ID);
    expect(repo.findIdByAlias).toHaveBeenCalledWith("SKILL", "typescript", TX);
    expect(repo.insertReturningId).not.toHaveBeenCalled();
    expect(repo.linkAlias).not.toHaveBeenCalled();
  });

  it("normalizes the lookup name (lowercase + trim + separators stripped)", async () => {
    const repo = makeRepo();
    repo.findIdByAlias.mockResolvedValue(EXISTING_NODE_ID);
    const svc = new NodeResolverService(repo);

    await svc.resolve("ROLE", "  Backend Developer  ", TX);

    expect(repo.findIdByAlias).toHaveBeenCalledWith(
      "ROLE",
      "backenddeveloper",
      TX,
    );
  });

  it("resolves separator variants to the same alias key", async () => {
    const repo = makeRepo();
    repo.findIdByAlias.mockResolvedValue(EXISTING_NODE_ID);
    const svc = new NodeResolverService(repo);

    for (const variant of ["REST Assured", "rest-assured", "Rest.Assured"]) {
      await svc.resolve("SKILL", variant, TX);
      expect(repo.findIdByAlias).toHaveBeenLastCalledWith(
        "SKILL",
        "restassured",
        TX,
      );
    }
  });

  it("creates node + alias on miss and returns the new id", async () => {
    const repo = makeRepo();
    repo.insertReturningId.mockResolvedValue(NODE_ID);
    const svc = new NodeResolverService(repo);

    const result = await svc.resolve("DOMAIN", "FinTech", TX);

    expect(result).toBe(NODE_ID);
    // canonical keeps original casing; alias is normalized.
    expect(repo.insertReturningId).toHaveBeenCalledWith("DOMAIN", "FinTech", TX);
    expect(repo.linkAlias).toHaveBeenCalledWith("fintech", "DOMAIN", NODE_ID, TX);
  });

  it("falls back to canonical SELECT when a concurrent insert wins", async () => {
    const repo = makeRepo();
    repo.insertReturningId.mockResolvedValue(null); // race lost
    repo.findIdByCanonical.mockResolvedValue(EXISTING_NODE_ID);
    const svc = new NodeResolverService(repo);

    const result = await svc.resolve("SKILL", "Go", TX);

    expect(result).toBe(EXISTING_NODE_ID);
    expect(repo.findIdByCanonical).toHaveBeenCalledWith("SKILL", "Go", TX);
    expect(repo.linkAlias).toHaveBeenCalledWith("go", "SKILL", EXISTING_NODE_ID, TX);
  });
});
