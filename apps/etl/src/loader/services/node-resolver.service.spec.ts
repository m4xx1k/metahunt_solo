import { NodeResolverService } from "./node-resolver.service";
import { NodeRepository } from "../repositories/node.repository";

const NODE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const EXISTING_NODE_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

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

    const result = await svc.resolve("SKILL", "TypeScript");

    expect(result).toBe(EXISTING_NODE_ID);
    expect(repo.findIdByAlias).toHaveBeenCalledWith("SKILL", "typescript");
    expect(repo.insertReturningId).not.toHaveBeenCalled();
    expect(repo.linkAlias).not.toHaveBeenCalled();
  });

  it("normalizes the lookup name (lowercase + trim)", async () => {
    const repo = makeRepo();
    repo.findIdByAlias.mockResolvedValue(EXISTING_NODE_ID);
    const svc = new NodeResolverService(repo);

    await svc.resolve("ROLE", "  Backend Developer  ");

    expect(repo.findIdByAlias).toHaveBeenCalledWith("ROLE", "backend developer");
  });

  it("creates node + alias on miss and returns the new id", async () => {
    const repo = makeRepo();
    repo.insertReturningId.mockResolvedValue(NODE_ID);
    const svc = new NodeResolverService(repo);

    const result = await svc.resolve("DOMAIN", "FinTech");

    expect(result).toBe(NODE_ID);
    // canonical keeps original casing; alias is normalized.
    expect(repo.insertReturningId).toHaveBeenCalledWith("DOMAIN", "FinTech");
    expect(repo.linkAlias).toHaveBeenCalledWith("fintech", "DOMAIN", NODE_ID);
  });

  it("falls back to canonical SELECT when a concurrent insert wins", async () => {
    const repo = makeRepo();
    repo.insertReturningId.mockResolvedValue(null); // race lost
    repo.findIdByCanonical.mockResolvedValue(EXISTING_NODE_ID);
    const svc = new NodeResolverService(repo);

    const result = await svc.resolve("SKILL", "Go");

    expect(result).toBe(EXISTING_NODE_ID);
    expect(repo.findIdByCanonical).toHaveBeenCalledWith("SKILL", "Go");
    expect(repo.linkAlias).toHaveBeenCalledWith("go", "SKILL", EXISTING_NODE_ID);
  });
});
