import { extractExternalId } from "./source-external-id";

describe("extractExternalId", () => {
  it("dispatches to the djinni extractor for source 'djinni'", () => {
    expect(
      extractExternalId("djinni", {
        guid: "https://djinni.co/jobs/821163-blockchain-developer/",
      }),
    ).toBe("821163");
  });

  it("dispatches to the dou extractor for source 'dou'", () => {
    expect(
      extractExternalId("dou", {
        guid:
          "https://jobs.dou.ua/companies/talanovyti-agency/vacancies/350774/?1777055493",
      }),
    ).toBe("350774");
  });

  it("throws for an unknown source code", () => {
    expect(() =>
      extractExternalId("unknown-source", { guid: "https://x/jobs/1/" }),
    ).toThrow(/unknown-source/);
  });

  it("propagates the underlying extractor's error on bad input", () => {
    expect(() =>
      extractExternalId("djinni", { guid: "https://djinni.co/companies/" }),
    ).toThrow(/djinni/);
  });
});
