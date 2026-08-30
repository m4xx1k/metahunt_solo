import { coverageApi } from "@/lib/api/coverage";

jest.mock("@/lib/api/auth-token", () => ({
  getToken: () => mockToken,
}));

let mockToken: string | null = null;

// client.ts picks the localStorage token only when a window exists; jest runs
// in node, so the browser branch has to be faked to exercise it.
const withWindow = () => {
  (globalThis as { window?: unknown }).window = {};
};

describe("coverageApi.lookup", () => {
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

  it("posts the pasted input and sends the Bearer token (@OperatorApi is admin-only)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ rows: [], summary: {}, sourceHealth: [], supportedHosts: [] }),
    });

    await coverageApi.lookup("https://jobs.dou.ua/companies/acme/vacancies/1/");

    expect(fetchMock.mock.calls[0][0]).toBe("http://api.test/admin/coverage/lookup");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer jwt-123");
    expect(init.body).toBe(
      JSON.stringify({ input: "https://jobs.dou.ua/companies/acme/vacancies/1/" }),
    );
  });

  it("throws ApiError on a non-2xx response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, text: async () => "bad input" });
    await expect(coverageApi.lookup("")).rejects.toMatchObject({ status: 400 });
  });
});
