import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";

import type { ListVacanciesResponse } from "./vacancies.contract";
import { VacanciesController } from "./vacancies.controller";
import { VacanciesService } from "./vacancies.service";
import { AggregatesService } from "./aggregates.service";
import { TracksService } from "./tracks.service";

const EMPTY: ListVacanciesResponse = {
  items: [],
  page: 1,
  pageSize: 20,
  total: 0,
};

describe("VacanciesController", () => {
  const list = jest.fn();
  let controller: VacanciesController;

  beforeEach(async () => {
    list.mockReset().mockResolvedValue(EMPTY);
    const moduleRef = await Test.createTestingModule({
      controllers: [VacanciesController],
      providers: [
        { provide: VacanciesService, useValue: { list } },
        { provide: AggregatesService, useValue: {} },
        { provide: TracksService, useValue: {} },
      ],
    }).compile();
    controller = moduleRef.get(VacanciesController);
  });

  describe("GET /vacancies — param parsing", () => {
    it("forwards undefined for every optional filter when no params are given", async () => {
      await controller.list();

      expect(list).toHaveBeenCalledWith({
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
      await controller.list(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        "SENIOR",
      );

      expect(list).toHaveBeenCalledWith(
        expect.objectContaining({ seniority: "SENIOR" }),
      );
    });

    it("rejects an unknown seniority value with 400", () => {
      expect(() =>
        controller.list(
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          "BOGUS",
        ),
      ).toThrow(BadRequestException);
      expect(list).not.toHaveBeenCalled();
    });

    it("treats a blank seniority as no filter", async () => {
      await controller.list(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        "   ",
      );

      expect(list).toHaveBeenCalledWith(
        expect.objectContaining({ seniority: undefined }),
      );
    });

    it("forwards a valid workFormat value", async () => {
      await controller.list(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        "REMOTE",
      );

      expect(list).toHaveBeenCalledWith(
        expect.objectContaining({ workFormat: "REMOTE" }),
      );
    });

    it("rejects an unknown workFormat value with 400", () => {
      expect(() =>
        controller.list(
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
      expect(list).not.toHaveBeenCalled();
    });

    it("forwards hasTestAssignment / hasReservation booleans", async () => {
      await controller.list(
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

      expect(list).toHaveBeenCalledWith(
        expect.objectContaining({
          hasTestAssignment: true,
          hasReservation: false,
        }),
      );
    });

    it("rejects a non-boolean hasTestAssignment with 400", () => {
      expect(() =>
        controller.list(
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
      expect(list).not.toHaveBeenCalled();
    });

    it("parses roleIds from repeated params (array) into a trimmed list", async () => {
      // roleIds is the 13th positional arg (appended after includeAllSkills).
      await controller.list(
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

      expect(list).toHaveBeenCalledWith(
        expect.objectContaining({ roleIds: ["a", "b"] }),
      );
    });

    it("treats an all-blank roleIds list as no filter (undefined)", async () => {
      await controller.list(
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

      expect(list).toHaveBeenCalledWith(
        expect.objectContaining({ roleIds: undefined }),
      );
    });

    it("composes seniority and workFormat with the existing filters", async () => {
      await controller.list(
        "react",
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        "MIDDLE",
        "HYBRID",
      );

      expect(list).toHaveBeenCalledWith(
        expect.objectContaining({
          q: "react",
          seniority: "MIDDLE",
          workFormat: "HYBRID",
        }),
      );
    });
  });
});
