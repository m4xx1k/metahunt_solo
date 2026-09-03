import { GUARDS_METADATA } from "@nestjs/common/constants";

import { OptionalAuthGuard } from "../../platform/auth/optional-auth.guard";
import { JwtAuthGuard } from "../../platform/auth/jwt-auth.guard";
import { IS_PUBLIC_KEY } from "../../platform/auth/decorators/public.decorator";

import { CvController } from "./cv.controller";

describe("CvController privacy boundary", () => {
  it("requires a JWT for every CV route by default", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, CvController)).toEqual(
      expect.arrayContaining([JwtAuthGuard]),
    );
  });

  it("exposes only seeded samples without a JWT", () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, CvController.prototype.samples)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, CvController.prototype.sampleMatches)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, CvController.prototype.upload)).toBeUndefined();
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, CvController.prototype.matches)).toBeUndefined();
  });

  // MET-144: an anonymous visitor previewing a sample CV on the feed reads its
  // profile too (no login required to try one). `get` is `@Public()` so the
  // class-level JwtAuthGuard lets it through, but it also carries its own
  // OptionalAuthGuard — unlike `samples`/`sampleMatches` above, which never
  // look at the caller's identity at all, `get`'s handler still resolves a
  // real (non-sample) request's ownership via `assertAccessibleCandidate`
  // (candidate-loader.int.spec.ts / cv.controller tests) when a valid token
  // rides along; it just never 401s an anonymous one outright.
  it("makes `get` public-with-optional-auth, not unconditionally public", () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, CvController.prototype.get)).toBe(true);
    expect(Reflect.getMetadata(GUARDS_METADATA, CvController.prototype.get)).toEqual(
      expect.arrayContaining([OptionalAuthGuard]),
    );
  });
});
