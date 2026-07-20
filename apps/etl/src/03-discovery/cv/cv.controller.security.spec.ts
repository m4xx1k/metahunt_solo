import { GUARDS_METADATA } from "@nestjs/common/constants";

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
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, CvController.prototype.upload)).toBeUndefined();
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, CvController.prototype.get)).toBeUndefined();
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, CvController.prototype.matches)).toBeUndefined();
  });
});
