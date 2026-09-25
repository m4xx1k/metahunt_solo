import { renderToStaticMarkup } from "react-dom/server";

import { WhyMerged as DashboardWhyMerged } from "@/app/dashboard/dedupe/_components/WhyMerged";
import { dedupRuleLabel, isRuleReason } from "@/lib/api/dedup";

import { WhyMerged as BadgeWhyMerged } from "./DuplicatesBadge";

const OLD_SHAPE = {
  matchedAgainstVacancyId: "v1",
  titleSimilarity: 0.91,
  prefilterMatches: { role: true, seniority: true },
  decidedAt: "2026-09-01T00:00:00Z",
};

const NEW_SHAPE = {
  rule: "cross_source" as const,
  matchedAgainstVacancyId: "v1",
  titleSim: 0.8,
  containment: 0.9,
  cosine: null,
  decidedAt: "2026-09-25T00:00:00Z",
};

describe("WhyMerged", () => {
  it("renders an old-shape reason as a neutral label with no numbers", () => {
    const dashboard = renderToStaticMarkup(<DashboardWhyMerged reason={OLD_SHAPE} />);
    expect(dashboard).toContain("earlier rules");
    expect(dashboard).not.toContain("NaN");
    expect(dashboard).not.toContain("cosine");
    expect(renderToStaticMarkup(<BadgeWhyMerged reason={OLD_SHAPE} />)).toContain("earlier rules");
  });

  it("renders a null cosine as a dash", () => {
    const dashboard = renderToStaticMarkup(<DashboardWhyMerged reason={NEW_SHAPE} />);
    expect(dashboard).toContain("same job, other board");
    expect(dashboard).toContain("title 80% · text 90% · cosine —");
    expect(renderToStaticMarkup(<BadgeWhyMerged reason={NEW_SHAPE} />)).toContain(
      "same job, other board",
    );
  });

  it("does not trust an unknown rule", () => {
    expect(isRuleReason({ ...NEW_SHAPE, rule: "semantic" })).toBe(false);
    expect(isRuleReason({ ...NEW_SHAPE, rule: "constructor" })).toBe(false);
    expect(dedupRuleLabel({ rule: "semantic" })).toBe("earlier rules");
  });
});
