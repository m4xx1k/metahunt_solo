import { NotFoundException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { Test } from "@nestjs/testing";

import { JwtAuthGuard } from "../platform/auth/jwt-auth.guard";

import { MeController } from "./me.controller";
import { MeService } from "./me.service";

describe("MeController account deletion", () => {
  const deleteAccount = jest.fn();
  const user = { userId: "user-1", telegramId: "telegram-1", roles: ["user"] };
  let controller: MeController;

  beforeEach(async () => {
    deleteAccount.mockReset();
    const moduleBuilder = Test.createTestingModule({
      controllers: [MeController],
      providers: [{ provide: MeService, useValue: { deleteAccount } }],
    });
    moduleBuilder.overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true });
    const moduleRef = await moduleBuilder.compile();
    controller = moduleRef.get(MeController);
  });

  it("keeps every account endpoint behind the JWT guard", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, MeController)).toEqual(
      expect.arrayContaining([JwtAuthGuard]),
    );
  });

  it("deletes only the current JWT account", async () => {
    deleteAccount.mockResolvedValue(true);

    await expect(controller.deleteAccount(user)).resolves.toEqual({ ok: true });
    expect(deleteAccount).toHaveBeenCalledWith("user-1");
  });

  it("does not confirm a missing account", async () => {
    deleteAccount.mockResolvedValue(false);

    await expect(controller.deleteAccount(user)).rejects.toBeInstanceOf(NotFoundException);
  });
});
