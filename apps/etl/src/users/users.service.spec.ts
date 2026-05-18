import { Test } from "@nestjs/testing";

import { DRIZZLE } from "@metahunt/database";

import { UsersService } from "./users.service";

/**
 * Mocked Drizzle chain — `insert(...).values(...).onConflictDoNothing(...).returning(...)`.
 * Each call returns `this` until `.returning()`, which resolves to the rows
 * we set via `setReturning()`. We assert call shape, not SQL output.
 */
function createDbMock() {
  let returningRows: Array<{ id: string }> = [];
  const values = jest.fn().mockReturnThis();
  const onConflictDoNothing = jest.fn().mockReturnThis();
  const returning = jest.fn().mockImplementation(async () => returningRows);
  const insert = jest.fn().mockReturnValue({
    values,
    onConflictDoNothing,
    returning,
  });
  return {
    db: { insert } as unknown,
    spies: { insert, values, onConflictDoNothing, returning },
    setReturning(rows: Array<{ id: string }>) {
      returningRows = rows;
    },
  };
}

describe("UsersService", () => {
  let service: UsersService;
  let mock: ReturnType<typeof createDbMock>;

  beforeEach(async () => {
    mock = createDbMock();
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: DRIZZLE, useValue: mock.db },
      ],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  describe("subscribe()", () => {
    it("returns 'subscribed' for a first-time email and normalizes it", async () => {
      mock.setReturning([{ id: "u-1" }]);

      const result = await service.subscribe(
        "  Test@Example.COM  ",
        "landing-cta",
      );

      expect(result).toEqual({ status: "subscribed" });
      expect(mock.spies.values).toHaveBeenCalledWith({
        email: "test@example.com",
        source: "landing-cta",
      });
      expect(mock.spies.onConflictDoNothing).toHaveBeenCalledTimes(1);
    });

    it("returns 'already_subscribed' when ON CONFLICT skipped the insert", async () => {
      mock.setReturning([]);

      const result = await service.subscribe("dup@example.com", "landing-cta");

      expect(result).toEqual({ status: "already_subscribed" });
    });
  });
});
