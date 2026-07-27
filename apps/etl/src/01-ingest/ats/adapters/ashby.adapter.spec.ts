import fixture from "./__fixtures__/ashby.mindly.json";
import { ashbyAdapter } from "./ashby.adapter";

describe("ashbyAdapter", () => {
  const items = ashbyAdapter.toItems(fixture, "mindly");

  it("maps every listed job in a live board payload", () => {
    expect(items).toHaveLength(fixture.jobs.length);
    expect(items[0]).toMatchObject({
      externalId: expect.any(String),
      title: expect.any(String),
      link: expect.stringContaining("http"),
    });
  });

  // The trap this adapter exists to avoid: Ashby returns a `compensation`
  // object on every job (46/46 on solidgate) with empty tiers. Presence of the
  // object is not presence of a salary.
  it("reports no salary when the compensation object is an empty shell", () => {
    expect(fixture.jobs[0].compensation).toBeDefined();
    expect(items.every((i) => i.salary === null)).toBe(true);
  });

  it("reads a salary only from a tier component carrying numbers", () => {
    const [withSalary] = ashbyAdapter.toItems(
      {
        jobs: [
          {
            id: "j1",
            title: "Staff Engineer",
            compensation: {
              compensationTiers: [
                {
                  components: [
                    {
                      compensationType: "Salary",
                      interval: "1 YEAR",
                      currencyCode: "USD",
                      minValue: 210000,
                      maxValue: 400000,
                    },
                    { compensationType: "Bonus", currencyCode: "USD", minValue: 31500 },
                  ],
                },
              ],
            },
          },
        ],
      },
      "acme",
    );

    expect(withSalary.salary).toEqual({
      min: 210000,
      max: 400000,
      currency: "USD",
      interval: "1 YEAR",
      raw: expect.stringContaining("compensationTiers"),
    });
  });

  it("drops postings the company has unlisted", () => {
    const result = ashbyAdapter.toItems(
      {
        jobs: [
          { id: "a", title: "Shown" },
          { id: "b", title: "Hidden", isListed: false },
        ],
      },
      "acme",
    );
    expect(result.map((i) => i.externalId)).toEqual(["a"]);
  });

  it("accepts secondaryLocations as either strings or objects", () => {
    const [item] = ashbyAdapter.toItems(
      {
        jobs: [
          {
            id: "a",
            title: "Engineer",
            location: "Kyiv",
            secondaryLocations: ["Lviv", { location: "Warsaw" }],
          },
        ],
      },
      "acme",
    );
    expect(item.locations).toEqual(["Kyiv", "Lviv", "Warsaw"]);
  });

  it("throws rather than returning nothing when the payload shape is unknown", () => {
    expect(() => ashbyAdapter.toItems({ postings: [] }, "acme")).toThrow();
  });
});
