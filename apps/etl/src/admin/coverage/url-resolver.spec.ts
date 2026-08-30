import { normalizeUrl, resolveUrl, splitInput } from "./url-resolver";

describe("normalizeUrl", () => {
  it("accepts a bare host and forces https", () => {
    expect(normalizeUrl("djinni.co/jobs/821163-dev/")?.toString()).toBe(
      "https://djinni.co/jobs/821163-dev",
    );
  });

  it("strips www., the fragment, and campaign params but keeps real ones", () => {
    expect(
      normalizeUrl(
        "http://www.jobs.dou.ua/companies/acme/vacancies/350774/?utm_source=tg&page=2#top",
      )?.toString(),
    ).toBe("https://jobs.dou.ua/companies/acme/vacancies/350774?page=2");
  });

  it("returns null for text that is not a URL", () => {
    expect(normalizeUrl("senior backend engineer")).toBeNull();
    expect(normalizeUrl("   ")).toBeNull();
    expect(normalizeUrl("mailto:hr@acme.com")).toBeNull();
  });
});

describe("resolveUrl", () => {
  it("resolves a DOU vacancy to its source and external id", () => {
    expect(resolveUrl("https://jobs.dou.ua/companies/acme/vacancies/350774/?1777055493")).toEqual({
      kind: "source",
      sourceCode: "dou",
      externalId: "350774",
      normalized: "https://jobs.dou.ua/companies/acme/vacancies/350774?1777055493",
    });
  });

  it("resolves a Djinni vacancy regardless of the slug", () => {
    expect(resolveUrl("https://djinni.co/jobs/821163-blockchain-developer/")).toMatchObject({
      kind: "source",
      sourceCode: "djinni",
      externalId: "821163",
    });
  });

  it("reports a source URL that carries no vacancy id", () => {
    expect(resolveUrl("https://djinni.co/jobs/?primary_keyword=Python")).toMatchObject({
      kind: "unparseable",
      reason: expect.stringContaining("djinni"),
    });
    expect(resolveUrl("https://jobs.dou.ua/companies/acme/")).toMatchObject({
      kind: "unparseable",
    });
  });

  it("recovers the posting id from our own vacancy URL", () => {
    expect(
      resolveUrl(
        "https://metahunt.app/vacancy/backend-engineer-3f1a2b4c-1111-2222-3333-444455556666",
      ),
    ).toMatchObject({
      kind: "metahunt",
      postingId: "3f1a2b4c-1111-2222-3333-444455556666",
    });
  });

  it("names an unsupported host instead of guessing", () => {
    expect(resolveUrl("https://www.linkedin.com/jobs/view/4012345678/")).toEqual({
      kind: "unsupported_host",
      host: "linkedin.com",
      normalized: "https://linkedin.com/jobs/view/4012345678",
    });
  });

  it("rejects free text", () => {
    expect(resolveUrl("Senior Go Engineer at Acme")).toEqual({
      kind: "unparseable",
      reason: "not a URL",
    });
  });
});

describe("splitInput", () => {
  it("drops blank lines and repeats so coverage counts distinct vacancies", () => {
    expect(splitInput("  a\n\n b \r\n a\nc\n")).toEqual(["a", "b", "c"]);
  });
});
