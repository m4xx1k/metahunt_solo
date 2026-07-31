import { pageTypeForPath } from "./page-view-tracker";

describe("pageTypeForPath", () => {
  it.each([
    ["/", "home"],
    ["/radar", "radar_index"],
    ["/radar/backend", "radar_track"],
    ["/match", "match"],
    ["/vacancy/123", "vacancy_detail"],
    ["/dashboard/analytics", "operator"],
    ["/me", "account"],
    ["/privacy", "other"],
  ])("classifies %s as %s", (pathname, expected) => {
    expect(pageTypeForPath(pathname)).toBe(expected);
  });
});
