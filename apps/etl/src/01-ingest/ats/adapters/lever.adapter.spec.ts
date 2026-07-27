import fixture from "./__fixtures__/lever.kyivstar.json";
import { leverAdapter } from "./lever.adapter";

describe("leverAdapter", () => {
  const items = leverAdapter.toItems(fixture, "kyivstar");

  it("maps a live board payload delivered as a bare array", () => {
    expect(items).toHaveLength(fixture.length);
    expect(items[0].link).toContain("http");
  });

  it("converts the epoch-millisecond createdAt", () => {
    const [item] = leverAdapter.toItems(
      [{ id: "x", text: "Engineer", createdAt: 1778485431868 }],
      "acme",
    );
    expect(item.publishedAt?.toISOString()).toBe(new Date(1778485431868).toISOString());
  });

  // Kyivstar tags most of its 125 postings `location: "All"`. Kept, it would
  // read as a place; dropped, `country` is the only geography that survives.
  it("strips the 'All' placeholder but keeps the country", () => {
    const [item] = leverAdapter.toItems(
      [
        {
          id: "x",
          text: "Engineer",
          country: "UA",
          categories: { location: "All", allLocations: ["All"] },
        },
      ],
      "acme",
    );
    expect(item.locations).toEqual(["UA"]);
  });

  it("maps the commitment vocabulary onto the employment enum", () => {
    const [item] = leverAdapter.toItems(
      [{ id: "x", text: "Engineer", categories: { commitment: "Full-time" } }],
      "acme",
    );
    expect(item.employmentType).toBe("FULL_TIME");
  });

  it("reads lowercase workplaceType", () => {
    const [hybrid] = leverAdapter.toItems(
      [{ id: "x", text: "E", workplaceType: "hybrid" }],
      "acme",
    );
    const [remote] = leverAdapter.toItems(
      [{ id: "y", text: "E", workplaceType: "remote" }],
      "acme",
    );
    expect(hybrid.isRemote).toBe(false);
    expect(remote.isRemote).toBe(true);
  });

  it("returns a salary only when the range carries numbers", () => {
    const [none] = leverAdapter.toItems([{ id: "x", text: "E", salaryRange: null }], "acme");
    const [some] = leverAdapter.toItems(
      [
        {
          id: "y",
          text: "E",
          salaryRange: { min: 140000, max: 160000, currency: "USD", interval: "per-year-salary" },
        },
      ],
      "acme",
    );
    expect(none.salary).toBeNull();
    expect(some.salary).toMatchObject({ min: 140000, max: 160000, currency: "USD" });
  });

  it("carries the department through for the tech gate", () => {
    expect(items[0].department).toBeTruthy();
  });

  // `description` is the opening blurb only; the requirements live in
  // `lists[]`. Dropping them starves the extractor without failing loudly.
  it("folds the lists sections into the description", () => {
    const [item] = leverAdapter.toItems(
      [
        {
          id: "x",
          text: "Engineer",
          description: "<p>About us</p>",
          lists: [
            { text: "Responsibilities:", content: "<div>Ship things</div>" },
            { text: "Requirements:", content: "<div>5y Go</div>" },
          ],
          additional: "<p>Perks</p>",
        },
      ],
      "acme",
    );
    expect(item.descriptionHtml).toContain("About us");
    expect(item.descriptionHtml).toContain("Responsibilities:");
    expect(item.descriptionHtml).toContain("Ship things");
    expect(item.descriptionHtml).toContain("5y Go");
    expect(item.descriptionHtml).toContain("Perks");
  });

  it("still produces a body when description is empty but lists are not", () => {
    const [item] = leverAdapter.toItems(
      [
        {
          id: "x",
          text: "Engineer",
          description: "",
          lists: [{ text: "Requirements:", content: "<div>Go</div>" }],
        },
      ],
      "acme",
    );
    expect(item.descriptionHtml.length).toBeGreaterThan(0);
  });
});
