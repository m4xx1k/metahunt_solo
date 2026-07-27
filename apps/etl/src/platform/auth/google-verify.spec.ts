import { verifyGoogleIdToken } from "./google-verify";

const verifyIdToken = jest.fn();
jest.mock("google-auth-library", () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: (...args: unknown[]) => verifyIdToken(...args),
  })),
}));

const ticket = (payload: Record<string, unknown> | undefined) => ({ getPayload: () => payload });

describe("verifyGoogleIdToken", () => {
  beforeEach(() => jest.clearAllMocks());

  it("checks the token against our client id as the audience", async () => {
    verifyIdToken.mockResolvedValue(
      ticket({ sub: "g-1", email: "a@b.test", email_verified: true, given_name: "Ada" }),
    );

    await expect(verifyGoogleIdToken("credential", "client-123")).resolves.toEqual({
      sub: "g-1",
      email: "a@b.test",
      emailVerified: true,
      firstName: "Ada",
    });
    // Without the audience check, a token minted for any other site would pass.
    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: "credential",
      audience: "client-123",
    });
  });

  it("returns null when the library rejects the token", async () => {
    verifyIdToken.mockRejectedValue(new Error("Wrong recipient"));

    await expect(verifyGoogleIdToken("forged", "client-123")).resolves.toBeNull();
  });

  it("returns null when the payload carries no subject", async () => {
    verifyIdToken.mockResolvedValue(ticket({ email: "a@b.test" }));

    await expect(verifyGoogleIdToken("credential", "client-123")).resolves.toBeNull();
  });

  it("reports an unverified email as unverified rather than dropping it", async () => {
    verifyIdToken.mockResolvedValue(
      ticket({ sub: "g-2", email: "spoof@b.test", email_verified: false }),
    );

    await expect(verifyGoogleIdToken("credential", "client-123")).resolves.toMatchObject({
      email: "spoof@b.test",
      emailVerified: false,
    });
  });

  it("falls back to the full name when Google sends no given_name", async () => {
    verifyIdToken.mockResolvedValue(ticket({ sub: "g-3", name: "Ada Lovelace" }));

    await expect(verifyGoogleIdToken("credential", "client-123")).resolves.toMatchObject({
      firstName: "Ada Lovelace",
    });
  });
});
