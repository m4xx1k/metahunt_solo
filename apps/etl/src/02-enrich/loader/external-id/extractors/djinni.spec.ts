import { djinniExtractor } from "./djinni";

describe("djinniExtractor", () => {
  describe("extracts numeric id from /jobs/ URLs", () => {
    it.each([
      [
        { guid: "https://djinni.co/jobs/821163-blockchain-developer/" },
        "821163",
      ],
      [
        {
          guid:
            "https://djinni.co/jobs/821162-short-form-video-editor-tiktok-meta-ads-reels/",
        },
        "821162",
      ],
      [{ guid: "https://djinni.co/jobs/789122-some-title/" }, "789122"],
    ])("guid %p -> %p", (item, expected) => {
      expect(djinniExtractor(item)).toBe(expected);
    });
  });

  it("falls back to link when guid is missing", () => {
    expect(
      djinniExtractor({ link: "https://djinni.co/jobs/555000-go-engineer/" }),
    ).toBe("555000");
  });

  it("prefers guid over link", () => {
    expect(
      djinniExtractor({
        guid: "https://djinni.co/jobs/111111-from-guid/",
        link: "https://djinni.co/jobs/222222-from-link/",
      }),
    ).toBe("111111");
  });

  it("throws on a URL without /jobs/<id>", () => {
    expect(() =>
      djinniExtractor({ guid: "https://djinni.co/companies/acme/" }),
    ).toThrow(/djinni/);
  });

  it("throws when both guid and link are absent", () => {
    expect(() => djinniExtractor({})).toThrow(/djinni/);
  });
});
