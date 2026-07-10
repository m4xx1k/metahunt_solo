import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { FeedQueryDto, MatchDto } from "./filter-params.dto";

const feed = (raw: Record<string, unknown>) => plainToInstance(FeedQueryDto, raw);
const feedErrors = async (raw: Record<string, unknown>) => (await validate(feed(raw))).length;

describe("FeedQueryDto transforms", () => {
  it("splits a CSV enum string into an array", () => {
    expect(feed({ seniorities: "MIDDLE,SENIOR" }).seniorities).toEqual(["MIDDLE", "SENIOR"]);
  });

  it("wraps a single repeated-param value into an array", () => {
    expect(feed({ workFormats: "REMOTE" }).workFormats).toEqual(["REMOTE"]);
  });

  it("keeps a real array and trims/drops blank ids", () => {
    expect(feed({ skillIds: [" a ", "", "b"] }).skillIds).toEqual(["a", "b"]);
  });

  it("treats an all-blank list as no filter (undefined)", () => {
    expect(feed({ roleIds: ["", "  "] }).roleIds).toBeUndefined();
  });

  it("coerces boolean query strings", () => {
    expect(feed({ hasTestAssignment: "true" }).hasTestAssignment).toBe(true);
    expect(feed({ hasReservation: "false" }).hasReservation).toBe(false);
  });

  it("coerces numeric query strings", () => {
    expect(feed({ page: "2", pageSize: "50" }).page).toBe(2);
    expect(feed({ pageSize: "50" }).pageSize).toBe(50);
  });
});

describe("FeedQueryDto validation", () => {
  it("accepts a valid query", async () => {
    expect(await feedErrors({ seniorities: "MIDDLE", workFormats: "REMOTE", page: "2" })).toBe(0);
  });

  it("rejects an unknown seniority", async () => {
    expect(await feedErrors({ seniorities: "BOGUS" })).toBeGreaterThan(0);
  });

  it("rejects an unknown workFormat", async () => {
    expect(await feedErrors({ workFormats: "ONSITE" })).toBeGreaterThan(0);
  });

  it("rejects a non-boolean flag", async () => {
    expect(await feedErrors({ hasTestAssignment: "maybe" })).toBeGreaterThan(0);
  });

  it("rejects a pageSize over the cap", async () => {
    expect(await feedErrors({ pageSize: "500" })).toBeGreaterThan(0);
  });
});

describe("MatchDto", () => {
  it("trims the CV skill list and validates a fit tier", async () => {
    const dto = plainToInstance(MatchDto, {
      skills: [" React ", ""],
      minFitTier: "GOOD",
      seniorities: ["MIDDLE"],
    });
    expect(dto.skills).toEqual(["React"]);
    expect((await validate(dto)).length).toBe(0);
  });

  it("rejects an unknown fit tier", async () => {
    expect(
      (await validate(plainToInstance(MatchDto, { minFitTier: "PERFECT" }))).length,
    ).toBeGreaterThan(0);
  });
});
