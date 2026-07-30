import { ValidationPipe } from "@nestjs/common";

import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { UpdateSubscriptionDto } from "./me.contract";

const errors = async (raw: Record<string, unknown>) =>
  validate(plainToInstance(UpdateSubscriptionDto, raw));

describe("UpdateSubscriptionDto", () => {
  it("trims the name and transforms valid criteria", async () => {
    const dto = plainToInstance(UpdateSubscriptionDto, {
      name: "  Night Shift  ",
      params: { seniorities: "MIDDLE,SENIOR", hasReservation: "true" },
    });

    expect(dto.name).toBe("Night Shift");
    expect(dto.params).toMatchObject({
      seniorities: ["MIDDLE", "SENIOR"],
      hasReservation: true,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it("rejects a blank name", async () => {
    expect(await errors({ name: "   " })).not.toHaveLength(0);
  });

  it("rejects an unknown criteria enum", async () => {
    expect(await errors({ params: { seniorities: ["LEGENDARY"] } })).not.toHaveLength(0);
  });

  it("rejects invalid source and experience values", async () => {
    expect(await errors({ params: { sourceId: "dou", experienceYears: ["10"] } })).not.toHaveLength(
      0,
    );
  });

  it.each(["name", "isActive", "params"])("rejects null %s", async (field) => {
    expect(await errors({ [field]: null })).not.toHaveLength(0);
  });

  it("rejects unknown nested criteria through the route pipe", async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    await expect(
      pipe.transform(
        { params: { typo: "x" } },
        { type: "body", metatype: UpdateSubscriptionDto, data: undefined },
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      pipe.transform(
        { params: {} },
        { type: "body", metatype: UpdateSubscriptionDto, data: undefined },
      ),
    ).resolves.toMatchObject({ params: {} });
  });
});
