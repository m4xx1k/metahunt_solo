import { taxonomyApi, TaxonomyApiError } from "@/lib/api/taxonomy";

jest.mock("@/lib/api/auth-token", () => ({
  getToken: () => mockToken,
}));

let mockToken: string | null = null;

// client.ts picks the localStorage token only when a window exists; jest runs
// in node, so the browser branch has to be faked to exercise it.
const withWindow = () => {
  (globalThis as { window?: unknown }).window = {};
};

describe("taxonomyApi mutations", () => {
  const fetchMock = jest.fn();
  const originalBase = process.env.NEXT_PUBLIC_API_URL;

  beforeEach(() => {
    withWindow();
    mockToken = "jwt-123";
    process.env.NEXT_PUBLIC_API_URL = "http://api.test";
    delete process.env.API_INTERNAL_URL;
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    delete (globalThis as { window?: unknown }).window;
    if (originalBase === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = originalBase;
  });

  const ok = (body: unknown) => fetchMock.mockResolvedValue({ ok: true, json: async () => body });

  const headersOf = (call: number) =>
    (fetchMock.mock.calls[call][1] as RequestInit).headers as Record<string, string>;

  it("sends the Bearer token on merge-into (every /admin/taxonomy route is @AdminOnly)", async () => {
    ok({ mergedInto: "b", source: "a", target: "b" });
    await taxonomyApi.mergeInto("a", "b");
    expect(fetchMock.mock.calls[0][0]).toBe("http://api.test/admin/taxonomy/nodes/a/merge-into/b");
    expect(headersOf(0).Authorization).toBe("Bearer jwt-123");
  });

  it("sends the Bearer token on verify, hide and rename", async () => {
    ok({ id: "a" });
    await taxonomyApi.verify("a");
    await taxonomyApi.hide("a");
    await taxonomyApi.rename("a", "Go");
    for (const i of [0, 1, 2]) {
      expect(headersOf(i).Authorization).toBe("Bearer jwt-123");
    }
    expect(headersOf(2)["content-type"]).toBe("application/json");
    expect((fetchMock.mock.calls[2][1] as RequestInit).body).toBe('{"name":"Go"}');
  });

  it("omits the header when there is no session token", async () => {
    mockToken = null;
    ok({ id: "a" });
    await taxonomyApi.verify("a");
    expect(headersOf(0).Authorization).toBeUndefined();
  });

  it("throws a typed error carrying the parsed body", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => '{"suggestion":{"mergeTargetId":"b"}}',
    });
    await expect(taxonomyApi.rename("a", "Go")).rejects.toMatchObject({
      status: 409,
      body: { suggestion: { mergeTargetId: "b" } },
    });
    await expect(taxonomyApi.rename("a", "Go")).rejects.toBeInstanceOf(TaxonomyApiError);
  });
});
