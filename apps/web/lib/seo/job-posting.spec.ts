import type { VacancyDto } from "@/lib/api/vacancies";

import { VACANCY_VALID_DAYS, buildJobPosting, isExpired, parseLocation } from "./job-posting";

const NOW = new Date("2026-07-25T00:00:00.000Z").getTime();
const DAY = 86_400_000;

function vacancy(over: Partial<VacancyDto> = {}): VacancyDto {
  return {
    id: "21710286-76e4-449e-b4a8-520693c42a9e",
    externalId: "830339",
    rssRecordId: "rss-1",
    source: { id: "s1", code: "djinni", displayName: "Djinni" },
    link: "https://djinni.co/jobs/830339",
    publishedAt: new Date(NOW - 2 * DAY).toISOString(),
    loadedAt: new Date(NOW - 2 * DAY).toISOString(),
    updatedAt: new Date(NOW - DAY).toISOString(),
    title: "Backend Developer (Payments) в Firetics, віддалено",
    description: "<p>Шукаємо Backend Developer</p>",
    company: { id: "c1", name: "Firetics", slug: "firetics" },
    role: { id: "r1", name: "Backend Developer" },
    domain: { id: "d1", name: "Fintech" },
    skills: { required: [{ id: "k1", name: "Go" }], optional: [] },
    seniority: "MIDDLE",
    workFormat: "REMOTE",
    employmentType: "FULL_TIME",
    englishLevel: "UPPER_INTERMEDIATE",
    experienceYears: 3,
    engagementType: "PRODUCT",
    hasTestAssignment: null,
    hasReservation: null,
    salary: { min: null, max: null, currency: null },
    locations: ["Kyiv, Ukraine"],
    uniqueVacancyId: null,
    duplicateCount: null,
    duplicateSourceCount: null,
    match: null,
    ...over,
  };
}

describe("parseLocation", () => {
  it("splits 'City, Country' into locality and country", () => {
    expect(parseLocation("Kyiv, Ukraine")).toEqual({
      "@type": "PostalAddress",
      addressLocality: "Kyiv",
      addressCountry: "Ukraine",
    });
  });

  it("drops a locality that just repeats the country", () => {
    // "Ukraine, Ukraine" is real data.
    expect(parseLocation("Ukraine, Ukraine")).toEqual({
      "@type": "PostalAddress",
      addressCountry: "Ukraine",
    });
  });

  it("treats a lone token as the country", () => {
    expect(parseLocation("Poland")).toEqual({
      "@type": "PostalAddress",
      addressCountry: "Poland",
    });
  });

  it("returns null for an empty string", () => {
    expect(parseLocation("")).toBeNull();
    expect(parseLocation(" , ")).toBeNull();
  });
});

describe("buildJobPosting — the eligibility gate", () => {
  it("emits markup when every required field is present", () => {
    const ld = buildJobPosting(vacancy(), NOW)!;

    expect(ld["@type"]).toBe("JobPosting");
    expect(ld.title).toBe("Backend Developer");
    expect(ld.hiringOrganization).toEqual({ "@type": "Organization", name: "Firetics" });
    expect(ld.description).toBe("<p>Шукаємо Backend Developer</p>");
    expect(ld.datePosted).toBeDefined();
  });

  it.each([
    ["no company", { company: null }],
    ["no description", { description: null }],
    ["blank description", { description: "   " }],
    ["no publish date", { publishedAt: null }],
  ])("returns null with %s", (_label, over) => {
    // Invalid markup at 4.9k-page scale risks a manual action against every
    // job result on the site, so a missing required field means no markup.
    expect(buildJobPosting(vacancy(over as Partial<VacancyDto>), NOW)).toBeNull();
  });

  it("returns null when it can say neither where the job is nor that it is remote", () => {
    expect(buildJobPosting(vacancy({ locations: [], workFormat: null }), NOW)).toBeNull();
    expect(buildJobPosting(vacancy({ locations: [], workFormat: "OFFICE" }), NOW)).toBeNull();
  });

  it("accepts a remote vacancy with no location at all", () => {
    const ld = buildJobPosting(vacancy({ locations: [], workFormat: "REMOTE" }), NOW)!;

    expect(ld.jobLocation).toBeUndefined();
    expect(ld.jobLocationType).toBe("TELECOMMUTE");
    expect(ld.applicantLocationRequirements).toEqual({ "@type": "Country", name: "Ukraine" });
  });

  it("falls back to the raw title when the role is missing", () => {
    const ld = buildJobPosting(vacancy({ role: null, title: "Data Analyst" }), NOW)!;

    expect(ld.title).toBe("Data Analyst");
  });
});

describe("buildJobPosting — expiry", () => {
  it("stops emitting markup once the posting is past validThrough", () => {
    const stale = vacancy({ publishedAt: new Date(NOW - 40 * DAY).toISOString() });

    expect(buildJobPosting(stale, NOW)).toBeNull();
  });

  it("still emits inside the window", () => {
    const fresh = vacancy({ publishedAt: new Date(NOW - 29 * DAY).toISOString() });

    expect(buildJobPosting(fresh, NOW)).not.toBeNull();
  });

  it("sets validThrough exactly one window past datePosted", () => {
    const published = new Date(NOW - DAY).toISOString();
    const ld = buildJobPosting(vacancy({ publishedAt: published }), NOW)!;

    const expected = new Date(new Date(published).getTime() + VACANCY_VALID_DAYS * DAY);
    expect(ld.validThrough).toBe(expected.toISOString());
  });

  it("treats a vacancy with no publish date as not expired", () => {
    // It is filtered out earlier for missing datePosted; isExpired must not
    // claim "expired" and mask that reason.
    expect(isExpired(null, NOW)).toBe(false);
  });
});

describe("buildJobPosting — honesty about the aggregator", () => {
  it("never claims direct apply", () => {
    // Applications go to the source board, and directApply exists precisely so
    // aggregators do not overstate this.
    expect(buildJobPosting(vacancy(), NOW)!.directApply).toBe(false);
  });

  it("names metahunt as the source, not the employer", () => {
    const ld = buildJobPosting(vacancy(), NOW)!;

    expect(ld.sourceOrganization).toEqual({ "@type": "Organization", name: "metahunt" });
    expect(ld.hiringOrganization).toEqual({ "@type": "Organization", name: "Firetics" });
  });

  it("omits baseSalary even when a range is known", () => {
    // schema.org needs a pay period and nothing extracts one; a guessed MONTH
    // would misstate compensation.
    const paid = vacancy({ salary: { min: 3000, max: 5000, currency: "USD" } });

    expect(buildJobPosting(paid, NOW)!.baseSalary).toBeUndefined();
  });

  it("points url at the canonical slugged path", () => {
    const ld = buildJobPosting(vacancy(), NOW)!;

    expect(ld.url).toBe(
      "https://www.metahunt.app/vacancy/backend-developer-21710286-76e4-449e-b4a8-520693c42a9e",
    );
  });
});

describe("buildJobPosting — optional mappings", () => {
  it("maps our employment enum onto Google's", () => {
    const t = (employmentType: VacancyDto["employmentType"]) =>
      buildJobPosting(vacancy({ employmentType }), NOW)!.employmentType;

    expect(t("FULL_TIME")).toBe("FULL_TIME");
    expect(t("PART_TIME")).toBe("PART_TIME");
    // Google has no CONTRACT / FREELANCE / INTERNSHIP.
    expect(t("CONTRACT")).toBe("CONTRACTOR");
    expect(t("FREELANCE")).toBe("CONTRACTOR");
    expect(t("INTERNSHIP")).toBe("INTERN");
    expect(buildJobPosting(vacancy({ employmentType: null }), NOW)!.employmentType).toBeUndefined();
  });

  it("converts stated years of experience to months", () => {
    expect(buildJobPosting(vacancy({ experienceYears: 3 }), NOW)!.experienceRequirements).toEqual({
      "@type": "OccupationalExperienceRequirements",
      monthsOfExperience: 36,
    });
  });

  it("omits experience when unstated or zero", () => {
    expect(
      buildJobPosting(vacancy({ experienceYears: null }), NOW)!.experienceRequirements,
    ).toBeUndefined();
    expect(
      buildJobPosting(vacancy({ experienceYears: 0 }), NOW)!.experienceRequirements,
    ).toBeUndefined();
  });

  it("lists required skills only", () => {
    const ld = buildJobPosting(
      vacancy({
        skills: {
          required: [
            { id: "1", name: "Go" },
            { id: "2", name: "PostgreSQL" },
          ],
          optional: [{ id: "3", name: "Kubernetes" }],
        },
      }),
      NOW,
    )!;

    expect(ld.skills).toBe("Go, PostgreSQL");
  });
});
