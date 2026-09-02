import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";

import { DRIZZLE } from "@metahunt/database";

import { DedupService } from "../../02-enrich/dedup/dedup.service";
import type { RequestWithUser } from "../../platform/auth/auth.types";
import { OptionalAuthGuard } from "../../platform/auth/optional-auth.guard";
import { NodeSlugResolver } from "../../platform/nodes/node-slug.resolver";
import { FeedQueryDto } from "../../platform/shared/filter-params.dto";
import type { MatchOverlay } from "../score/score.contract";
import {
  createCandidateScorer,
  overlayForUser,
  resolveActiveCandidateId,
  resolveSampleCandidateId,
  resolveViewerSkills,
  type CandidateScorer,
} from "../score/scorer.port";

import { FacetsService } from "./facets.service";
import type { FeedResponse, VacancyDto } from "./feed.contract";
import { FeedController } from "./feed.controller";
import { FeedService } from "./feed.service";

jest.mock("../score/scorer.port");
const overlayForUserMock = jest.mocked(overlayForUser);
const resolveActiveCandidateIdMock = jest.mocked(resolveActiveCandidateId);
const resolveSampleCandidateIdMock = jest.mocked(resolveSampleCandidateId);
const resolveViewerSkillsMock = jest.mocked(resolveViewerSkills);
const createCandidateScorerMock = jest.mocked(createCandidateScorer);

const EMPTY: FeedResponse = {
  items: [],
  page: 1,
  pageSize: 20,
  total: 0,
  offStackHidden: 0,
};

const anon: RequestWithUser = { headers: {} };
const asUser = (userId: string): RequestWithUser => ({
  headers: {},
  user: { userId, telegramId: null, roles: [] },
});

// The controller now only maps a validated FeedQueryDto → FeedSearchParams;
// query parsing/validation lives in the DTO (see filter-params.dto.spec.ts).
describe("FeedController", () => {
  const search = jest.fn();
  const getById = jest.fn();
  const listForSitemap = jest.fn();
  const resolveCompanySlug = jest.fn();
  // Identity resolver: slug->id resolution is covered separately; here it must
  // pass values through so the DTO→FeedSearchParams mapping stays assertable.
  const slugs = {
    toIds: jest.fn(async (_type: string, v?: string[]) => v),
    toId: jest.fn(async (_type: string, v?: string) => v),
  };
  let controller: FeedController;

  beforeEach(async () => {
    search.mockReset().mockResolvedValue(EMPTY);
    getById.mockReset();
    listForSitemap.mockReset().mockResolvedValue([]);
    resolveCompanySlug.mockReset().mockResolvedValue(null);
    overlayForUserMock.mockReset().mockResolvedValue(new Map());
    resolveViewerSkillsMock.mockReset().mockResolvedValue([]);
    resolveActiveCandidateIdMock.mockReset().mockResolvedValue(null);
    resolveSampleCandidateIdMock.mockReset().mockResolvedValue(null);
    createCandidateScorerMock.mockReset().mockResolvedValue(null);
    const moduleRef = await Test.createTestingModule({
      controllers: [FeedController],
      providers: [
        { provide: DRIZZLE, useValue: {} },
        { provide: FeedService, useValue: { search, getById, listForSitemap } },
        { provide: FacetsService, useValue: { resolveCompanySlug } },
        { provide: DedupService, useValue: {} },
        { provide: NodeSlugResolver, useValue: slugs },
      ],
    })
      // The guard's own behavior is covered by optional-auth.guard.spec.ts;
      // these tests call controller methods directly (no HTTP pipeline), and
      // Nest still resolves a controller's declared guards at compile time.
      .overrideGuard(OptionalAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(FeedController);
  });

  const dto = (over: Partial<FeedQueryDto> = {}): FeedQueryDto =>
    Object.assign(new FeedQueryDto(), over);

  it("defaults page/pageSize and forwards undefined for absent filters", async () => {
    await controller.search(dto(), anon);

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
      null,
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
      anon,
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
      null,
    );
  });

  describe("companySlug", () => {
    it("resolves the slug to a company id before filtering", async () => {
      resolveCompanySlug.mockResolvedValue("company-uuid");

      await controller.search(dto({ companySlug: "acme" }), anon);

      expect(resolveCompanySlug).toHaveBeenCalledWith("acme");
      expect(search).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: "company-uuid" }),
        null,
      );
    });

    it("matches nothing for an unknown slug instead of dropping the filter", async () => {
      resolveCompanySlug.mockResolvedValue(null);

      await controller.search(dto({ companySlug: "does-not-exist" }), anon);

      // Falling through to `undefined` here would return the whole feed under
      // a company landing that has no vacancies.
      const [params] = search.mock.calls[0];
      expect(params.companyId).toBe("00000000-0000-0000-0000-000000000000");
    });

    it("leaves the filter off when no slug is given", async () => {
      await controller.search(dto(), anon);

      expect(resolveCompanySlug).not.toHaveBeenCalled();
      expect(search).toHaveBeenCalledWith(expect.objectContaining({ companyId: undefined }), null);
    });
  });

  // §7 step 3: resolveFeedQuery resolves a candidate id (JWT active CV, or an
  // allowlisted ?sample=) and turns it into the scorer FeedService.search gets.
  describe("candidate resolution", () => {
    it("resolves no candidate, and no scorer, for an anonymous request", async () => {
      await controller.search(dto(), anon);

      expect(resolveActiveCandidateIdMock).not.toHaveBeenCalled();
      expect(resolveSampleCandidateIdMock).not.toHaveBeenCalled();
      expect(search).toHaveBeenLastCalledWith(expect.anything(), null);
    });

    it("scores the page against the signed-in viewer's active CV", async () => {
      resolveActiveCandidateIdMock.mockResolvedValue("candidate-1");
      const scorer: CandidateScorer = { overlayFor: jest.fn(), fragments: jest.fn() };
      createCandidateScorerMock.mockResolvedValue(scorer);

      await controller.search(dto(), asUser("user-1"));

      expect(resolveActiveCandidateIdMock).toHaveBeenCalledWith(expect.anything(), "user-1");
      expect(createCandidateScorerMock).toHaveBeenCalledWith(expect.anything(), "candidate-1");
      expect(search).toHaveBeenLastCalledWith(expect.anything(), scorer);
    });

    it("scores against an allowlisted ?sample= id, ignoring the signed-in viewer", async () => {
      resolveSampleCandidateIdMock.mockResolvedValue("sample-1");
      const scorer: CandidateScorer = { overlayFor: jest.fn(), fragments: jest.fn() };
      createCandidateScorerMock.mockResolvedValue(scorer);

      await controller.search(dto({ sample: "sample-1" }), asUser("user-1"));

      expect(resolveSampleCandidateIdMock).toHaveBeenCalledWith(expect.anything(), "sample-1");
      expect(resolveActiveCandidateIdMock).not.toHaveBeenCalled();
      expect(search).toHaveBeenLastCalledWith(expect.anything(), scorer);
    });

    it("404s for a ?sample= id that isn't an allowlisted sample candidate", async () => {
      resolveSampleCandidateIdMock.mockResolvedValue(null);

      await expect(controller.search(dto({ sample: "not-a-sample" }), anon)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(search).not.toHaveBeenCalled();
    });
  });

  describe("sitemap", () => {
    it("defaults to the product's 30-day freshness window", async () => {
      await controller.sitemap(undefined);

      expect(listForSitemap).toHaveBeenCalledWith(30);
    });

    it("honours an explicit window", async () => {
      await controller.sitemap("7");

      expect(listForSitemap).toHaveBeenCalledWith(7);
    });

    it("caps the window so one request cannot ask for the whole table", async () => {
      await controller.sitemap("99999");

      expect(listForSitemap).toHaveBeenCalledWith(365);
    });

    it("rejects a non-positive window", async () => {
      await expect(controller.sitemap("0")).rejects.toBeInstanceOf(BadRequestException);
      await expect(controller.sitemap("abc")).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("vacancy", () => {
    const NO_SKILLS = { required: [], optional: [] };

    it("returns the vacancy plus diff: null when found", async () => {
      const vacancy = {
        id: "v1",
        uniqueVacancyId: "pos-1",
        skills: NO_SKILLS,
      } as unknown as VacancyDto;
      getById.mockResolvedValue(vacancy);

      await expect(controller.vacancy("v1", anon)).resolves.toEqual({ ...vacancy, diff: null });
      expect(getById).toHaveBeenCalledWith("v1");
    });

    it("404s when the vacancy is not found", async () => {
      getById.mockResolvedValue(null);

      await expect(controller.vacancy("missing", anon)).rejects.toBeInstanceOf(NotFoundException);
    });

    it("never resolves a scorer or the viewer's skills for an anonymous visitor", async () => {
      const vacancy = {
        id: "v1",
        uniqueVacancyId: "pos-1",
        skills: NO_SKILLS,
      } as unknown as VacancyDto;
      getById.mockResolvedValue(vacancy);

      await controller.vacancy("v1", anon);

      expect(overlayForUserMock).not.toHaveBeenCalled();
      expect(resolveViewerSkillsMock).not.toHaveBeenCalled();
    });

    it("attaches the signed-in viewer's match overlay, keyed off the Position id", async () => {
      const vacancy = {
        id: "v1",
        uniqueVacancyId: "pos-1",
        match: null,
        skills: NO_SKILLS,
      } as unknown as VacancyDto;
      getById.mockResolvedValue(vacancy);
      const overlay: MatchOverlay = {
        relevance: 1,
        coverage: 0.5,
        tier: "GOOD",
        percent: 50,
        onStack: true,
      };
      overlayForUserMock.mockResolvedValue(new Map([["pos-1", overlay]]));

      const result = await controller.vacancy("v1", asUser("user-1"));

      expect(overlayForUserMock).toHaveBeenCalledWith(expect.anything(), "user-1", ["pos-1"]);
      expect(result.match).toBe(overlay);
    });

    it("leaves match and diff null for a signed-in viewer with nothing scored (no CV)", async () => {
      const vacancy = {
        id: "v1",
        uniqueVacancyId: "pos-1",
        match: null,
        skills: NO_SKILLS,
      } as unknown as VacancyDto;
      getById.mockResolvedValue(vacancy);
      overlayForUserMock.mockResolvedValue(new Map());

      const result = await controller.vacancy("v1", asUser("user-1"));

      expect(result.match).toBeNull();
      expect(result.diff).toBeNull();
    });

    it("builds the have/missing/bonus diff from the vacancy's skills and the viewer's own", async () => {
      const required1 = { id: "req-1", name: "Go" }; // viewer has it → have
      const required2 = { id: "req-2", name: "Kubernetes" }; // viewer lacks it → missing
      const optional1 = { id: "opt-1", name: "Docker" }; // viewer has it → have
      const bonusSkill = { id: "bonus-1", name: "Rust" }; // not on the vacancy → bonus
      const vacancy = {
        id: "v1",
        uniqueVacancyId: "pos-1",
        match: null,
        skills: { required: [required1, required2], optional: [optional1] },
      } as unknown as VacancyDto;
      getById.mockResolvedValue(vacancy);
      overlayForUserMock.mockResolvedValue(
        new Map([
          ["pos-1", { relevance: 1, coverage: 0.5, tier: "GOOD", percent: 50, onStack: true }],
        ]),
      );
      resolveViewerSkillsMock.mockResolvedValue([required1, optional1, bonusSkill]);

      const result = await controller.vacancy("v1", asUser("user-1"));

      expect(result.diff).toEqual({
        have: [required1, optional1],
        missing: [required2],
        bonus: [bonusSkill],
      });
    });
  });
});
