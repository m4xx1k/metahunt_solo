import { eq, sql } from "drizzle-orm";
import type { Pool } from "pg";

import { schema, type DrizzleDB } from "@metahunt/database";

import { MeService } from "../../src/account/me.service";

import { makeTestDb } from "./db";

const { users, candidates, userCvs, subscriptions } = schema;

let db: DrizzleDB;
let pool: Pool;

function makeService(): MeService {
  return new MeService(db, {} as never);
}

async function seedUser(): Promise<string> {
  const [user] = await db.insert(users).values({ source: "test" }).returning({ id: users.id });
  return user.id;
}

let hashSeq = 0;
async function seedCandidate(role = "Backend Developer"): Promise<string> {
  hashSeq += 1;
  const [candidate] = await db
    .insert(candidates)
    .values({ contentHash: `hash-${hashSeq}`, sourceText: "", extracted: {}, role })
    .returning({ id: candidates.id });
  return candidate.id;
}

async function link(userId: string, candidateId: string): Promise<string> {
  const [row] = await db
    .insert(userCvs)
    .values({ userId, candidateId, label: "CV", isActive: true })
    .returning({ id: userCvs.id });
  return row.id;
}

beforeAll(() => {
  ({ db, pool } = makeTestDb());
});

afterAll(async () => {
  await pool.end();
});

afterEach(async () => {
  await db.execute(
    sql`TRUNCATE TABLE subscriptions, user_cvs, candidates, users RESTART IDENTITY CASCADE`,
  );
});

describe("MeService.deleteCv (integration)", () => {
  it("deletes the final owner's candidate and every associated CV subscription", async () => {
    const me = makeService();
    const userId = await seedUser();
    const candidateId = await seedCandidate();
    const linkId = await link(userId, candidateId);
    await db.insert(subscriptions).values({
      userId,
      candidateId,
      params: {},
      isActive: true,
    });

    await expect(me.deleteCv(userId, linkId)).resolves.toBe(true);
    expect(await db.select().from(userCvs)).toHaveLength(0);
    expect(await db.select().from(candidates)).toHaveLength(0);
    expect(await db.select().from(subscriptions)).toHaveLength(0);
  });

  it("does not delete a CV link owned by another account", async () => {
    const me = makeService();
    const owner = await seedUser();
    const otherUser = await seedUser();
    const candidateId = await seedCandidate();
    const linkId = await link(owner, candidateId);

    await expect(me.deleteCv(otherUser, linkId)).resolves.toBe(false);
    expect(await db.select().from(candidates)).toHaveLength(1);
    expect(await db.select().from(userCvs)).toHaveLength(1);
  });

  it("keeps a legacy shared candidate until its final owner deletes it", async () => {
    const me = makeService();
    const firstOwner = await seedUser();
    const secondOwner = await seedUser();
    const candidateId = await seedCandidate();
    const firstLink = await link(firstOwner, candidateId);
    await link(secondOwner, candidateId);

    await expect(me.deleteCv(firstOwner, firstLink)).resolves.toBe(true);
    const owners = await db.select().from(userCvs).where(eq(userCvs.candidateId, candidateId));
    expect(owners).toHaveLength(1);
    expect(owners[0].userId).toBe(secondOwner);
    expect(await db.select().from(candidates).where(eq(candidates.id, candidateId))).toHaveLength(
      1,
    );
  });
});
