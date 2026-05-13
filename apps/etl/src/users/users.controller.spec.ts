import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";

import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

describe("UsersController", () => {
  const subscribe = jest.fn();
  let controller: UsersController;

  beforeEach(async () => {
    subscribe.mockReset().mockResolvedValue({ status: "subscribed" });
    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: { subscribe } }],
    }).compile();
    controller = moduleRef.get(UsersController);
  });

  describe("POST /users/subscribe", () => {
    it("forwards a valid signup to the service", async () => {
      const result = await controller.subscribe({
        email: "hello@example.com",
        source: "landing-cta",
      });

      expect(subscribe).toHaveBeenCalledWith(
        "hello@example.com",
        "landing-cta",
      );
      expect(result).toEqual({ status: "subscribed" });
    });

    it("rejects a missing email", async () => {
      await expect(
        controller.subscribe({ source: "landing-cta" }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(subscribe).not.toHaveBeenCalled();
    });

    it("rejects an email without @", async () => {
      await expect(
        controller.subscribe({ email: "not-an-email", source: "landing-cta" }),
      ).rejects.toThrow(/format/);
    });

    it("rejects an email exceeding the max length", async () => {
      const local = "a".repeat(250);
      await expect(
        controller.subscribe({
          email: `${local}@x.io`,
          source: "landing-cta",
        }),
      ).rejects.toThrow(/254/);
    });

    it("rejects an unknown source", async () => {
      await expect(
        controller.subscribe({
          email: "ok@example.com",
          // @ts-expect-error — runtime check covers unknown sources
          source: "not-a-real-source",
        }),
      ).rejects.toThrow(/source must be one of/);
    });
  });
});
