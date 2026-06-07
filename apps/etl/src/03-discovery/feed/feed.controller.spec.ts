import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";

import { DedupService } from "../../02-enrich/dedup/dedup.service";
import type { FeedResponse } from "./feed.contract";
import { FeedController } from "./feed.controller";
import { FeedService } from "./feed.service";
import { FacetsService } from "./facets.service";

const EMPTY: FeedResponse = {
  items: [],
  page: 1,
  pageSize: 20,
  total: 0,
};

describe("FeedController", () => {
  const search = jest.fn();
  let controller: FeedController;

  beforeEach(async () => {
    search.mockReset().mockResolvedValue(EMPTY);
    const moduleRef = await Test.createTestingModule({
      controllers: [FeedController],
      providers: [
        { provide: FeedService, useValue: { search } },
        { provide: FacetsService, useValue: {} },
        { provide: DedupService, useValue: {} },
      ],
    }).compile();
    controller = moduleRef.get(FeedController);
  });

  describe("GET /feed — param parsing", () => {
    it("forwards undefined for every optional filter when no params are given", async () => {
      await controller.search();

      expect(search).toHaveBeenCalledWith({
        q: undefined,
        sourceId: undefined,
        roleId: undefined,
        roleIds: undefined,
        skillIds: undefined,
        seniority: undefined,
        workFormat: undefined,
        hasTestAssignment: undefined,
        hasReservation: undefined,
        page: 1,
        pageSize: 20,
        includeRoleless: undefined,
        includeAllSkills: undefined,
      });
    });

    it("forwards a valid seniority value", async () => {
      await controller.search(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        "SENIOR",
      );

      expect(search).toHaveBeenCalledWith(
        expect.objectContaining({ seniority: "SENIOR" }),
      );
    });

    it("rejects an unknown seniority value with 400", () => {
      expect(() =>
        controller.search(
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          "BOGUS",
        ),
      ).toThrow(BadRequestException);
      expect(search).not.toHaveBeenCalled();
    });

    it("treats a blank seniority as no filter", async () => {
      await controller.search(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        "   ",
      );

      expect(search).toHaveBeenCalledWith(
        expect.objectContaining({ seniority: undefined }),
      );
    });

    it("forwards a valid workFormat value", async () => {
      await controller.search(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        "REMOTE",
      );

      expect(search).toHaveBeenCalledWith(
        expect.objectContaining({ workFormat: "REMOTE" }),
      );
    });

    it("rejects an unknown workFormat value with 400", () => {
      expect(() =>
        controller.search(
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          "ONSITE",
        ),
      ).toThrow(BadRequestException);
      expect(search).not.toHaveBeenCalled();
    });

    it("forwards hasTestAssignment / hasReservation booleans", async () => {
      await controller.search(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        "true",
        "false",
      );

      expect(search).toHaveBeenCalledWith(
        expect.objectContaining({
          hasTestAssignment: true,
          hasReservation: false,
        }),
      );
    });

    it("rejects a non-boolean hasTestAssignment with 400", () => {
      expect(() =>
        controller.search(
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          "maybe",
        ),
      ).toThrow(BadRequestException);
      expect(search).not.toHaveBeenCalled();
    });

    it("parses roleIds from repeated params (array) into a trimmed list", async () => {
      // roleIds is the 13th positional arg (appended after includeAllSkills).
      await controller.search(
        undefined, // q
        undefined, // page
        undefined, // pageSize
        undefined, // sourceId
        undefined, // roleId
        undefined, // skillIds
        undefined, // seniority
        undefined, // workFormat
        undefined, // hasTestAssignment
        undefined, // hasReservation
        undefined, // includeRoleless
        undefined, // includeAllSkills
        [" a ", "b", "  "], // roleIds — repeated query params
      );

      expect(search).toHaveBeenCalledWith(
        expect.objectContaining({ roleIds: ["a", "b"] }),
      );
    });

    it("treats an all-blank roleIds list as no filter (undefined)", async () => {
      await controller.search(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        ["", "   "],
      );

      expect(search).toHaveBeenCalledWith(
        expect.objectContaining({ roleIds: undefined }),
      );
    });

    it("composes seniority and workFormat with the existing filters", async () => {
      await controller.search(
        "react",
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        "MIDDLE",
        "HYBRID",
      );

      expect(search).toHaveBeenCalledWith(
        expect.objectContaining({
          q: "react",
          seniority: "MIDDLE",
          workFormat: "HYBRID",
        }),
      );
    });
  });
});
