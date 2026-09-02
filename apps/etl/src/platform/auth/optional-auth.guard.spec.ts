import type { ExecutionContext } from "@nestjs/common";

import { OptionalAuthGuard } from "./optional-auth.guard";

function requestContext(authorization?: string): {
  context: ExecutionContext;
  request: { headers: { authorization?: string }; user?: unknown };
} {
  const request = { headers: { authorization } };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
  return { context, request };
}

describe("OptionalAuthGuard", () => {
  const verify = jest.fn();
  const getMe = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeGuard(): OptionalAuthGuard {
    return new OptionalAuthGuard({ verify } as never, { getMe } as never);
  }

  it("allows an anonymous request through untouched, without touching the token verifier", async () => {
    const { context, request } = requestContext(undefined);

    await expect(makeGuard().canActivate(context)).resolves.toBe(true);

    expect(verify).not.toHaveBeenCalled();
    expect(request.user).toBeUndefined();
  });

  it("attaches request.user for a valid token, same shape as JwtAuthGuard", async () => {
    verify.mockReturnValue({ sub: "user-1", tid: "old-telegram", roles: ["admin"] });
    getMe.mockResolvedValue({
      id: "user-1",
      telegramId: "telegram-1",
      username: null,
      firstName: null,
      roles: ["user"],
    });
    const { context, request } = requestContext("Bearer valid-token");

    await expect(makeGuard().canActivate(context)).resolves.toBe(true);

    expect(request.user).toEqual({ userId: "user-1", telegramId: "telegram-1", roles: ["user"] });
  });

  it("falls back to anonymous — not a rejection — for an invalid signature", async () => {
    verify.mockImplementation(() => {
      throw new Error("bad signature");
    });
    const { context, request } = requestContext("Bearer bad-token");

    await expect(makeGuard().canActivate(context)).resolves.toBe(true);

    expect(getMe).not.toHaveBeenCalled();
    expect(request.user).toBeUndefined();
  });

  it("falls back to anonymous — not a rejection — for a deleted/stale account", async () => {
    verify.mockReturnValue({ sub: "deleted-user", roles: ["user"] });
    getMe.mockResolvedValue(null);
    const { context, request } = requestContext("Bearer old-token");

    await expect(makeGuard().canActivate(context)).resolves.toBe(true);

    expect(request.user).toBeUndefined();
  });

  it("still lets a real AuthService failure surface, rather than masking it as anonymous", async () => {
    verify.mockReturnValue({ sub: "user-1", roles: ["user"] });
    getMe.mockRejectedValue(new Error("database unavailable"));
    const { context } = requestContext("Bearer valid-token");

    await expect(makeGuard().canActivate(context)).rejects.toThrow("database unavailable");
  });
});
