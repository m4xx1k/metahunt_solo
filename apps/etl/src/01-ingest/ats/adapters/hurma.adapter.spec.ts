import fixture from "./__fixtures__/hurma.roshen.json";
import { hurmaAdapter, hurmaNextPageUrl } from "./hurma.adapter";

describe("hurmaAdapter", () => {
  const items = hurmaAdapter.toItems(fixture, "roshen");

  it("unwraps the Laravel paginator envelope", () => {
    expect(items).toHaveLength(fixture.result.data.length);
  });

  // The finding that reverses the "ATS carries no salary for UA" conclusion:
  // the Ukrainian ATS does, in UAH and USD, on Ukrainian postings.
  it("reads the structured salary Ukrainian boards actually publish", () => {
    const withSalary = items.filter((i) => i.salary !== null);
    expect(withSalary.length).toBeGreaterThan(0);
    expect(withSalary[0].salary).toMatchObject({
      min: expect.any(Number),
      currency: expect.stringMatching(/^(UAH|USD|EUR)$/),
      interval: "MONTH",
    });
  });

  // PHP renders an empty associative array as `[]` and a populated one as an
  // object, so this field changes TYPE with its emptiness. A schema that only
  // accepts the object shape throws on every salary-less posting.
  it("treats the empty-array form of salary as absent", () => {
    const [item] = hurmaAdapter.toItems(
      { result: { data: [{ id: 1, name: "Розробник", salary: [] }] } },
      "acme",
    );
    expect(item.salary).toBeNull();
  });

  it("reads employment type and remote out of the same Ukrainian work_types array", () => {
    const [item] = hurmaAdapter.toItems(
      {
        result: {
          data: [{ id: 1, name: "Розробник", work_types: ["Віддалена", "Повна зайнятість"] }],
        },
      },
      "acme",
    );
    expect(item.employmentType).toBe("FULL_TIME");
    expect(item.isRemote).toBe(true);
  });

  it("joins the four body fields into one description", () => {
    const [item] = hurmaAdapter.toItems(
      {
        result: {
          data: [
            {
              id: 1,
              name: "Розробник",
              description: "Про компанію",
              responsibility: "Обовʼязки",
              working_conditions: "Умови",
              addition: "Додатково",
            },
          ],
        },
      },
      "acme",
    );
    expect(item.descriptionHtml).toBe("Про компанію\n\nОбовʼязки\n\nУмови\n\nДодатково");
  });

  // "2025-12-08 12:55:09" has no zone. Read as UTC it would shift every
  // Ukrainian posting by 2-3 hours.
  it("interprets the zoneless timestamp as Kyiv local, not UTC", () => {
    const [item] = hurmaAdapter.toItems(
      { result: { data: [{ id: 1, name: "Розробник", created_at: "2025-12-08 12:55:09" }] } },
      "acme",
    );
    // December → Kyiv is UTC+2.
    expect(item.publishedAt?.toISOString()).toBe("2025-12-08T10:55:09.000Z");
  });

  it("interprets a summer timestamp at the summer offset", () => {
    const [item] = hurmaAdapter.toItems(
      { result: { data: [{ id: 1, name: "Розробник", created_at: "2026-07-08 12:55:09" }] } },
      "acme",
    );
    // July → Kyiv is UTC+3.
    expect(item.publishedAt?.toISOString()).toBe("2026-07-08T09:55:09.000Z");
  });

  // `department_id` is a tenant-local number with no name in the payload, so
  // the TECH/NONTECH department gate cannot run on this source.
  it("reports no department, since Hurma exposes only an opaque id", () => {
    expect(items.every((i) => i.department === null)).toBe(true);
  });

  it("follows pagination only while pages remain", () => {
    expect(hurmaNextPageUrl({ result: { data: [], current_page: 1, last_page: 3 } }, "acme")).toBe(
      "https://acme.hurma.work/api/vacancies?page=2",
    );
    expect(
      hurmaNextPageUrl({ result: { data: [], current_page: 3, last_page: 3 } }, "acme"),
    ).toBeNull();
  });
});
