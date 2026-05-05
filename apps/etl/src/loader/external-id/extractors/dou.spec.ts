import { douExtractor } from "./dou";

describe("douExtractor", () => {
  describe("extracts numeric id from /vacancies/ URLs", () => {
    it.each([
      [
        {
          guid:
            "https://jobs.dou.ua/companies/talanovyti-agency/vacancies/350774/?1777055493",
        },
        "350774",
      ],
      [
        {
          guid:
            "https://jobs.dou.ua/companies/acme/vacancies/356789/",
        },
        "356789",
      ],
      [
        {
          link:
            "https://jobs.dou.ua/companies/talanovyti-agency/vacancies/350774/?utm_source=jobsrss",
        },
        "350774",
      ],
    ])("input %p -> %p", (item, expected) => {
      expect(douExtractor(item)).toBe(expected);
    });
  });

  it("prefers guid over link", () => {
    expect(
      douExtractor({
        guid: "https://jobs.dou.ua/companies/x/vacancies/111/",
        link: "https://jobs.dou.ua/companies/x/vacancies/222/",
      }),
    ).toBe("111");
  });

  it("throws on a URL without /vacancies/<id>", () => {
    expect(() =>
      douExtractor({ guid: "https://jobs.dou.ua/companies/acme/" }),
    ).toThrow(/dou/);
  });

  it("throws when both guid and link are absent", () => {
    expect(() => douExtractor({})).toThrow(/dou/);
  });
});
