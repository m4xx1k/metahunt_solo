import { redactCvLinks } from "./redact-cv-links";

describe("redactCvLinks", () => {
  it("redacts the bearer token from event URLs", () => {
    expect(
      redactCvLinks({
        $current_url: "https://www.metahunt.app/feed?cv=8f14e45f-ceea-467a-9d0e-5f0c0e0e0e0e&x=1",
        $referrer: "https://www.metahunt.app/match?cv=secret",
      }),
    ).toEqual({
      $current_url: "https://www.metahunt.app/feed?cv=redacted&x=1",
      $referrer: "https://www.metahunt.app/match?cv=redacted",
    });
  });

  it("redacts the $set_once bag, which lands on the person profile forever", () => {
    expect(
      redactCvLinks({
        $set_once: {
          $initial_current_url: "https://www.metahunt.app/feed?cv=secret",
          $initial_referrer: "https://www.metahunt.app/?cv=secret&utm_source=reddit",
        },
      }),
    ).toEqual({
      $set_once: {
        $initial_current_url: "https://www.metahunt.app/feed?cv=redacted",
        $initial_referrer: "https://www.metahunt.app/?cv=redacted&utm_source=reddit",
      },
    });
  });

  it("leaves non-string values alone", () => {
    expect(redactCvLinks({ count: 3, ok: true, missing: null })).toEqual({
      count: 3,
      ok: true,
      missing: null,
    });
  });
});
