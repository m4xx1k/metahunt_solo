import { validateEnv } from "./env.validation";

// The dev-login bypass is a real auth shortcut, so the one invariant that must
// never regress is: it can never be enabled in production. That gate lives in
// env validation (folded into the value), so it's testable as a pure function.
const base = { DATABASE_URL: "postgres://u:p@localhost:5432/db" };

describe("validateEnv — dev-login gate", () => {
  it("enables dev login outside production when DEV_LOGIN_ENABLED=1", () => {
    const env = validateEnv({ ...base, NODE_ENV: "development", DEV_LOGIN_ENABLED: "1" });
    expect(env.DEV_LOGIN_ENABLED).toBe("1");
  });

  it("forces dev login OFF in production even when DEV_LOGIN_ENABLED=1", () => {
    const env = validateEnv({
      ...base,
      NODE_ENV: "production",
      JWT_SECRET: "prod-secret",
      DEV_LOGIN_ENABLED: "1",
    });
    expect(env.DEV_LOGIN_ENABLED).toBe("");
  });

  it("defaults to off when unset", () => {
    const env = validateEnv({ ...base, NODE_ENV: "development" });
    expect(env.DEV_LOGIN_ENABLED).toBe("");
  });

  it("passes DEV_LOGIN_TELEGRAM_ID through", () => {
    const env = validateEnv({
      ...base,
      NODE_ENV: "development",
      DEV_LOGIN_ENABLED: "1",
      DEV_LOGIN_TELEGRAM_ID: "42",
    });
    expect(env.DEV_LOGIN_TELEGRAM_ID).toBe("42");
  });
});
