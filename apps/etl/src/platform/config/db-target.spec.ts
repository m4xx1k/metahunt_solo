import { DbTargetRefusal, assertWritableDbTarget, describeDbTarget } from "./db-target";

const PROD = "postgresql://user:secret@viaduct.proxy.rlwy.net:31234/railway";
const LOCAL = "postgres://metahunt:metahunt@localhost:54322/metahunt_lab";

describe("describeDbTarget", () => {
  it("labels a target without leaking credentials", () => {
    const t = describeDbTarget(PROD);
    expect(t.label).toBe("viaduct.proxy.rlwy.net:31234/railway");
    expect(t.label).not.toContain("secret");
    expect(t.isLocal).toBe(false);
  });

  it("defaults the port so the label always names one", () => {
    expect(describeDbTarget("postgres://u:p@db.example.com/metahunt").label).toBe(
      "db.example.com:5432/metahunt",
    );
  });

  it("recognizes local hosts", () => {
    expect(describeDbTarget(LOCAL).isLocal).toBe(true);
    expect(describeDbTarget("postgres://u:p@127.0.0.1:5432/metahunt").isLocal).toBe(true);
  });

  it("refuses rather than guessing when the URL is missing or malformed", () => {
    expect(() => describeDbTarget(undefined)).toThrow(DbTargetRefusal);
    expect(() => describeDbTarget("not-a-url")).toThrow(DbTargetRefusal);
  });
});

describe("assertWritableDbTarget", () => {
  const write = { write: true, acknowledged: false };

  it("refuses a write to a non-local database", () => {
    expect(() => assertWritableDbTarget(describeDbTarget(PROD), write)).toThrow(DbTargetRefusal);
  });

  it("names the target and the flag in the refusal", () => {
    expect(() => assertWritableDbTarget(describeDbTarget(PROD), write)).toThrow(
      /viaduct\.proxy\.rlwy\.net:31234\/railway[\s\S]*--yes-prod/,
    );
  });

  it("allows the write once acknowledged", () => {
    expect(() =>
      assertWritableDbTarget(describeDbTarget(PROD), { write: true, acknowledged: true }),
    ).not.toThrow();
  });

  // A dry-run against prod is how a plan gets validated against real data.
  it("allows a read-only run anywhere", () => {
    expect(() =>
      assertWritableDbTarget(describeDbTarget(PROD), { write: false, acknowledged: false }),
    ).not.toThrow();
  });

  it("allows an unacknowledged write to a local database", () => {
    expect(() => assertWritableDbTarget(describeDbTarget(LOCAL), write)).not.toThrow();
  });
});
