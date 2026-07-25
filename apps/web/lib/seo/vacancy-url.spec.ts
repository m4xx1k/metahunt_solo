import { parseVacancyId, slugifyForUrl, vacancyPath, vacancySlugSource } from "./vacancy-url";

const ID = "21710286-76e4-449e-b4a8-520693c42a9e";

describe("vacancySlugSource", () => {
  it("prefers the verified role over the raw title", () => {
    // The real shape of a DOU title: role + company + cities + work format.
    expect(
      vacancySlugSource({
        roleName: "Backend Developer",
        title: "Backend Developer (Payments) в Firetics, віддалено",
      }),
    ).toBe("Backend Developer");
  });

  it("falls back to the title when there is no role", () => {
    expect(vacancySlugSource({ roleName: null, title: "Data Analyst" })).toBe("Data Analyst");
    expect(vacancySlugSource({ roleName: "   ", title: "Data Analyst" })).toBe("Data Analyst");
  });
});

describe("slugifyForUrl", () => {
  it("lowercases and hyphenates", () => {
    expect(slugifyForUrl("Backend Developer")).toBe("backend-developer");
    expect(slugifyForUrl("Full Stack Developer")).toBe("full-stack-developer");
  });

  it("collapses punctuation instead of leaving double hyphens", () => {
    expect(slugifyForUrl("C#/.NET Developer")).toBe("c-net-developer");
    expect(slugifyForUrl("Node.js Engineer")).toBe("node-js-engineer");
  });

  it("never returns an empty slug", () => {
    // A fully non-Latin or punctuation-only source would otherwise produce
    // "/vacancy/-<uuid>", which is an ugly but *valid* URL — so it would ship.
    expect(slugifyForUrl("Розробник")).toBe("vacancy");
    expect(slugifyForUrl("!!!")).toBe("vacancy");
    expect(slugifyForUrl("")).toBe("vacancy");
  });
});

describe("vacancyPath", () => {
  it("puts the slug first and the id last", () => {
    expect(vacancyPath({ id: ID, roleName: "Backend Developer", title: "whatever" })).toBe(
      `/vacancy/backend-developer-${ID}`,
    );
  });

  it("round-trips: the path it builds parses back to the same id", () => {
    // The page 308s whenever the requested segment differs from vacancyPath's
    // output, so a broken round trip would be an infinite redirect loop.
    for (const roleName of ["Backend Developer", "C#/.NET Developer", "Розробник", null]) {
      const path = vacancyPath({ id: ID, roleName, title: "Data Analyst" });
      expect(parseVacancyId(path.replace("/vacancy/", ""))).toBe(ID);
    }
  });

  it("is idempotent for the same input", () => {
    const a = vacancyPath({ id: ID, roleName: "QA Engineer", title: "x" });
    const b = vacancyPath({ id: ID, roleName: "QA Engineer", title: "x" });
    expect(a).toBe(b);
  });
});

describe("parseVacancyId", () => {
  it("reads the id out of a slugged segment", () => {
    expect(parseVacancyId(`backend-developer-${ID}`)).toBe(ID);
  });

  it("still accepts a bare uuid, so old links keep working", () => {
    expect(parseVacancyId(ID)).toBe(ID);
  });

  it("normalises case", () => {
    expect(parseVacancyId(`qa-${ID.toUpperCase()}`)).toBe(ID);
  });

  it("rejects anything without a trailing uuid", () => {
    expect(parseVacancyId("backend-developer")).toBeNull();
    expect(parseVacancyId("")).toBeNull();
    // A uuid that isn't at the end is not the id of this page.
    expect(parseVacancyId(`${ID}-trailing`)).toBeNull();
  });
});
