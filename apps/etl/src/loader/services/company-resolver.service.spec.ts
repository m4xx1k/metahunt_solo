import { CompanyResolverService } from "./company-resolver.service";
import { CompanyRepository } from "../repositories/company.repository";

const SOURCE_ID = "11111111-1111-1111-1111-111111111111";
const COMPANY_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const EXISTING_COMPANY_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

// The repository boundary lets us mock plain intention-revealing methods and
// assert on their real arguments — no Drizzle query-builder chain to fake.
function makeRepo(): jest.Mocked<CompanyRepository> {
  return {
    findIdByIdentifier: jest.fn().mockResolvedValue(null),
    findIdBySlug: jest.fn().mockResolvedValue(null),
    insertReturningId: jest.fn().mockResolvedValue(null),
    linkIdentifier: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<CompanyRepository>;
}

describe("CompanyResolverService.resolve", () => {
  it("returns existing id on identifier hit (no slug lookup, no inserts)", async () => {
    const repo = makeRepo();
    repo.findIdByIdentifier.mockResolvedValue(EXISTING_COMPANY_ID);
    const svc = new CompanyResolverService(repo);

    const result = await svc.resolve(SOURCE_ID, "Acme Corp");

    expect(result).toBe(EXISTING_COMPANY_ID);
    expect(repo.findIdByIdentifier).toHaveBeenCalledWith(SOURCE_ID, "Acme Corp");
    expect(repo.findIdBySlug).not.toHaveBeenCalled();
    expect(repo.insertReturningId).not.toHaveBeenCalled();
    expect(repo.linkIdentifier).not.toHaveBeenCalled();
  });

  it("links existing slug-matched company on identifier miss (no company insert)", async () => {
    const repo = makeRepo();
    repo.findIdBySlug.mockResolvedValue(EXISTING_COMPANY_ID);
    const svc = new CompanyResolverService(repo);

    const result = await svc.resolve(SOURCE_ID, "Acme Corp");

    expect(result).toBe(EXISTING_COMPANY_ID);
    expect(repo.findIdBySlug).toHaveBeenCalledWith("acme-corp");
    expect(repo.insertReturningId).not.toHaveBeenCalled();
    expect(repo.linkIdentifier).toHaveBeenCalledWith(
      SOURCE_ID,
      "Acme Corp",
      EXISTING_COMPANY_ID,
    );
  });

  it("creates company + identifier when both are missing", async () => {
    const repo = makeRepo();
    repo.insertReturningId.mockResolvedValue(COMPANY_ID);
    const svc = new CompanyResolverService(repo);

    const result = await svc.resolve(SOURCE_ID, "Acme Corp");

    expect(result).toBe(COMPANY_ID);
    expect(repo.insertReturningId).toHaveBeenCalledWith("Acme Corp", "acme-corp");
    expect(repo.linkIdentifier).toHaveBeenCalledWith(
      SOURCE_ID,
      "Acme Corp",
      COMPANY_ID,
    );
  });

  it("slugifies the name and preserves the raw display name", async () => {
    const repo = makeRepo();
    repo.insertReturningId.mockResolvedValue(COMPANY_ID);
    const svc = new CompanyResolverService(repo);

    await svc.resolve(SOURCE_ID, "  Hello World, Inc!  ");

    expect(repo.insertReturningId).toHaveBeenCalledWith(
      "Hello World, Inc!",
      "hello-world-inc",
    );
  });

  it("recovers via re-read when a concurrent insert wins the race", async () => {
    const repo = makeRepo();
    repo.findIdBySlug
      .mockResolvedValueOnce(null) // initial slug miss
      .mockResolvedValueOnce(EXISTING_COMPANY_ID); // re-read finds the winner
    repo.insertReturningId.mockResolvedValue(null); // race lost
    const svc = new CompanyResolverService(repo);

    const result = await svc.resolve(SOURCE_ID, "Acme Corp");

    expect(result).toBe(EXISTING_COMPANY_ID);
    expect(repo.findIdBySlug).toHaveBeenCalledTimes(2);
    expect(repo.linkIdentifier).toHaveBeenCalledWith(
      SOURCE_ID,
      "Acme Corp",
      EXISTING_COMPANY_ID,
    );
  });
});
