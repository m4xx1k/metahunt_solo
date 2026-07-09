import { eq, sql } from "drizzle-orm";
import { schema, type DrizzleDB } from "@metahunt/database";
import type { Pool } from "pg";

import { MeService } from "../../src/account/me.service";
import { makeTestDb } from "./db";

const { users, candidates, userCvs } = schema;

let db: DrizzleDB;
let pool: Pool;

// linkCv/listCvs are the only methods exercised; neither touches
// SubscriptionsService, so a stub is enough to construct the service.
function makeService(): MeService {
  return new MeService(db, {} as never);
}

async function seedUser(): Promise<string> {
  const [u] = await db
    .insert(users)
    .values({ source: "test" })
    .returning({ id: users.id });
  return u.id;
}

let hashSeq = 0;
async function seedCandidate(role: string | null): Promise<string> {
  hashSeq += 1;
  const [c] = await db
    .insert(candidates)
    .values({
      contentHash: `hash-${hashSeq}`,
      sourceText: `cv ${hashSeq}`,
      extracted: {},
      role,
    })
    .returning({ id: candidates.id });
  return c.id;
}

beforeAll(() => {
  ({ db, pool } = makeTestDb());
});

afterAll(async () => {
  await pool.end();
});

afterEach(async () => {
  await db.execute(
    sql`TRUNCATE TABLE user_cvs, candidates, users RESTART IDENTITY CASCADE`,
  );
});

describe("MeService.linkCv (integration)", () => {
  it("links a candidate to the user and marks the first one active", async () => {
    const me = makeService();
    const userId = await seedUser();
    const candidateId = await seedCandidate("Backend Developer");

    await me.linkCv(userId, candidateId);

    const cvs = await me.listCvs(userId);
    expect(cvs).toHaveLength(1);
    expect(cvs[0]).toMatchObject({
      candidateId,
      label: "Backend Developer",
      isActive: true,
    });
  });

  it("never clobbers an existing active CV when a second is linked", async () => {
    const me = makeService();
    const userId = await seedUser();
    const first = await seedCandidate("Go Dev");
    const second = await seedCandidate("Rust Dev");

    await me.linkCv(userId, first);
    await me.linkCv(userId, second);

    const active = (await me.listCvs(userId)).filter((c) => c.isActive);
    expect(active).toHaveLength(1);
    expect(active[0].candidateId).toBe(first);
  });

  it("is idempotent: re-linking the same CV keeps one ownership row", async () => {
    const me = makeService();
    const userId = await seedUser();
    const candidateId = await seedCandidate("Backend Developer");

    await me.linkCv(userId, candidateId);
    await me.linkCv(userId, candidateId);

    const rows = await db
      .select()
      .from(userCvs)
      .where(eq(userCvs.userId, userId));
    expect(rows).toHaveLength(1);
  });

  it("no-ops for an unknown candidate (GC / stale id): no ownership row", async () => {
    const me = makeService();
    const userId = await seedUser();
    const ghost = "00000000-0000-4000-8000-000000000000";

    await me.linkCv(userId, ghost);

    const rows = await db
      .select()
      .from(userCvs)
      .where(eq(userCvs.userId, userId));
    expect(rows).toHaveLength(0);
  });
});
