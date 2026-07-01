import { Test } from "@nestjs/testing";

import { DedupService } from "../../02-enrich/dedup/dedup.service";
import { FeedQueryDto } from "../../platform/shared/filter-params.dto";
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

// The controller now only maps a validated FeedQueryDto → FeedSearchParams;
// query parsing/validation lives in the DTO (see filter-params.dto.spec.ts).
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

  const dto = (over: Partial<FeedQueryDto> = {}): FeedQueryDto =>
    Object.assign(new FeedQueryDto(), over);

  it("defaults page/pageSize and forwards undefined for absent filters", async () => {
    await controller.search(dto());

    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        pageSize: 20,
        seniorities: undefined,
        workFormats: undefined,
        englishLevels: undefined,
        employmentTypes: undefined,
        skillIds: undefined,
      }),
    );
  });

  it("maps the validated DTO fields into FeedSearchParams", async () => {
    await controller.search(
      dto({
        q: "react",
        seniorities: ["MIDDLE", "SENIOR"],
        workFormats: ["REMOTE"],
        englishLevels: ["UPPER_INTERMEDIATE"],
        skillIds: ["a", "b"],
        postedWithinDays: 7,
        page: 2,
      }),
    );

    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        q: "react",
        seniorities: ["MIDDLE", "SENIOR"],
        workFormats: ["REMOTE"],
        englishLevels: ["UPPER_INTERMEDIATE"],
        skillIds: ["a", "b"],
        postedWithinDays: 7,
        page: 2,
      }),
    );
  });
});
