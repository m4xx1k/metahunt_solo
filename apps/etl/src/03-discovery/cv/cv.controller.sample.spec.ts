import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";

import { JwtAuthGuard } from "../../platform/auth/jwt-auth.guard";
import { NodeSlugResolver } from "../../platform/nodes/node-slug.resolver";
import { RankingService } from "../ranking/ranking.service";
import { RecommendationService } from "../ranking/recommendation.service";

import { AdditionalSkillsService } from "./additional-skills.service";
import { CandidateMatchService } from "./candidate-match.service";
import { CandidateLoaderService } from "./candidate-loader.service";
import { CvController } from "./cv.controller";

describe("CvController sample matches", () => {
  const assertSampleCandidate = jest.fn();
  const match = jest.fn();
  let controller: CvController;

  beforeEach(async () => {
    jest.clearAllMocks();
    assertSampleCandidate.mockResolvedValue(undefined);
    match.mockResolvedValue({
      resolved: { matched: [], unmatched: [] },
      items: [],
      page: 2,
      pageSize: 20,
      total: 0,
    });

    const moduleBuilder = Test.createTestingModule({
      controllers: [CvController],
      providers: [
        {
          provide: CandidateLoaderService,
          useValue: { assertSampleCandidate },
        },
        { provide: CandidateMatchService, useValue: { match } },
        { provide: RankingService, useValue: {} },
        { provide: RecommendationService, useValue: {} },
        { provide: AdditionalSkillsService, useValue: {} },
        { provide: NodeSlugResolver, useValue: {} },
      ],
    });
    moduleBuilder.overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true });
    const moduleRef = await moduleBuilder.compile();
    controller = moduleRef.get(CvController);
  });

  it("ranks a seeded sample without requiring an account", async () => {
    await controller.sampleMatches("sample-id", {
      seniorities: ["MIDDLE", "SENIOR"],
      domainIds: ["fintech"],
      page: 2,
    });

    expect(assertSampleCandidate).toHaveBeenCalledWith("sample-id");
    expect(match).toHaveBeenCalledWith(
      "sample-id",
      expect.objectContaining({
        seniorities: ["MIDDLE", "SENIOR"],
        domainRefs: ["fintech"],
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
    expect(match).not.toHaveBeenCalled();
  });
});
