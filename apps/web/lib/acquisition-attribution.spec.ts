import { readAcquisitionAttribution } from "./acquisition-attribution";

describe("readAcquisitionAttribution", () => {
  it("keeps bounded campaign identifiers", () => {
    expect(
      readAcquisitionAttribution({
        utm_source: "telegram",
        utm_medium: "community-post",
        utm_campaign: "backend_launch.v1",
        creative_id: ["pain-hook-01", "ignored"],
      }),
    ).toEqual({
      utm_source: "telegram",
      utm_medium: "community-post",
      utm_campaign: "backend_launch.v1",
      creative_id: "pain-hook-01",
    });
  });

  it("drops free-form and oversized values before analytics", () => {
    expect(
      readAcquisitionAttribution({
        utm_source: "person@example.com",
        utm_campaign: "a".repeat(65),
        utm_content: "backend engineers",
        unrelated: "keep-out",
      }),
    ).toEqual({});
  });
});
