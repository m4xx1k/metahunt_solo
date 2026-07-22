import { UnauthorizedException, type ExecutionContext } from "@nestjs/common";

import { JwtAuthGuard } from "./jwt-auth.guard";

function requestContext(authorization?: string): {
  context: ExecutionContext;
  request: { headers: { authorization?: string }; user?: unknown };
} {
  const request = { headers: { authorization } };
  const context = {
    getHandler: () => "handler",
    getClass: () => "controller",
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
  return { context, request };
}

describe("JwtAuthGuard", () => {
  const verify = jest.fn();
  const getAllAndOverride = jest.fn();
  const getMe = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    getAllAndOverride.mockReturnValue(false);
  });

  function makeGuard(): JwtAuthGuard {
    return new JwtAuthGuard(
      { verify } as never,
      { getAllAndOverride } as never,
      { getMe } as never,
    );
  }

  it("uses current database roles instead of stale token roles", async () => {
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

    expect(getMe).toHaveBeenCalledWith("user-1");
    expect(request.user).toEqual({
      userId: "user-1",
      telegramId: "telegram-1",
      roles: ["user"],
    });
  });

  it("rejects a valid signature after its account was deleted", async () => {
    verify.mockReturnValue({ sub: "deleted-user", roles: ["user"] });
    getMe.mockResolvedValue(null);
    const { context } = requestContext("Bearer old-token");

    await expect(makeGuard().canActivate(context)).rejects.toThrow("deleted or stale account");
  });

  it("rejects an invalid signature without querying the account", async () => {
    verify.mockImplementation(() => {
      throw new Error("bad signature");
    });
    const { context } = requestContext("Bearer bad-token");

    await expect(makeGuard().canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(getMe).not.toHaveBeenCalled();
  });

  it("lets database failures surface as service failures", async () => {
    verify.mockReturnValue({ sub: "user-1", roles: ["user"] });
    getMe.mockRejectedValue(new Error("database unavailable"));
    const { context } = requestContext("Bearer valid-token");

    await expect(makeGuard().canActivate(context)).rejects.toThrow("database unavailable");
  });
});
