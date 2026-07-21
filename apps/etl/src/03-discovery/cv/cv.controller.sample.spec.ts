import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";

import { JwtAuthGuard } from "../../platform/auth/jwt-auth.guard";
import { NodeSlugResolver } from "../../platform/nodes/node-slug.resolver";
import { RankingService } from "../ranking/ranking.service";
import { RecommendationService } from "../ranking/recommendation.service";

import { AdditionalSkillsService } from "./additional-skills.service";
import { CandidateLoaderService } from "./candidate-loader.service";
import { CvController } from "./cv.controller";

describe("CvController sample matches", () => {
  const assertSampleCandidate = jest.fn();
  const getMatchInput = jest.fn();
  const rankByRefs = jest.fn();
  const toIds = jest.fn();
  let controller: CvController;

  beforeEach(async () => {
    jest.clearAllMocks();
    assertSampleCandidate.mockResolvedValue(undefined);
    getMatchInput.mockResolvedValue({ matched: [], unmatched: [] });
    rankByRefs.mockResolvedValue({
      resolved: { matched: [], unmatched: [] },
      items: [],
      page: 2,
      pageSize: 20,
      total: 0,
    });
    toIds.mockResolvedValue(["domain-id"]);

    const moduleBuilder = Test.createTestingModule({
      controllers: [CvController],
      providers: [
        {
          provide: CandidateLoaderService,
          useValue: { assertSampleCandidate, getMatchInput },
        },
        { provide: RankingService, useValue: { rankByRefs } },
        { provide: RecommendationService, useValue: {} },
        { provide: AdditionalSkillsService, useValue: {} },
        { provide: NodeSlugResolver, useValue: { toIds } },
      ],
    });
    moduleBuilder.overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true });
    const moduleRef = await moduleBuilder.compile();
    controller = moduleRef.get(CvController);
  });

  it("ranks a seeded sample without requiring an account", async () => {
    await controller.sampleMatches("sample-id", {
      seniorities: "MIDDLE,SENIOR",
      domainIds: "fintech",
      page: "2",
    });

    expect(assertSampleCandidate).toHaveBeenCalledWith("sample-id");
    expect(getMatchInput).toHaveBeenCalledWith("sample-id");
    expect(toIds).toHaveBeenCalledWith("DOMAIN", ["fintech"]);
    expect(rankByRefs).toHaveBeenCalledWith(
      { matched: [], unmatched: [] },
      expect.objectContaining({
        seniorities: ["MIDDLE", "SENIOR"],
        domainIds: ["domain-id"],
      }),
      2,
      20,
    );
  });

  it("does not rank a non-sample candidate", async () => {
    assertSampleCandidate.mockRejectedValue(new NotFoundException());

    await expect(controller.sampleMatches("private-id", {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(getMatchInput).not.toHaveBeenCalled();
    expect(rankByRefs).not.toHaveBeenCalled();
  });
});
