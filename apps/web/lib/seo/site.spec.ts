import { SITE_URL, absoluteUrl } from "./site";

describe("absoluteUrl", () => {
  it("returns the bare origin for the site root", () => {
    // A trailing slash here would make canonical and og:url disagree with the
    // sitemap's <loc>, which is exactly the duplicate-signal this file prevents.
    expect(absoluteUrl("/")).toBe(SITE_URL);
    expect(absoluteUrl("")).toBe(SITE_URL);
    expect(absoluteUrl()).toBe(SITE_URL);
  });

  it("prefixes the origin onto a rooted path", () => {
    expect(absoluteUrl("/radar")).toBe(`${SITE_URL}/radar`);
  });

  it("tolerates a path given without its leading slash", () => {
    expect(absoluteUrl("radar/backend")).toBe(`${SITE_URL}/radar/backend`);
  });

  it("keeps the canonical origin on www", () => {
    // The apex 308-redirects to www; emitting the apex anywhere would undo that.
    expect(SITE_URL).toBe("https://www.metahunt.app");
  });
});
