import { Test } from "@nestjs/testing";

import { SubscriptionRepairService } from "./subscription-repair.service";

const SRC = "33333333-3333-3333-3333-333333333333";
const DST = "44444444-4444-4444-4444-444444444444";
const OTHER = "55555555-5555-5555-5555-555555555555";

// The service issues exactly two SELECTs (verified nodes, then subscriptions)
// before any UPDATE — queue them in that order and let every later call (the
// per-row UPDATEs) fall back to the default.
function mockExecutor(verifiedIds: string[], subRows: Record<string, unknown>[]) {
  const execute = jest.fn();
  execute.mockResolvedValueOnce({ rows: verifiedIds.map((id) => ({ id })) });
  execute.mockResolvedValueOnce({ rows: subRows });
  execute.mockResolvedValue({ rows: [] });
  return { execute };
}

async function bootstrap(): Promise<SubscriptionRepairService> {
  const moduleRef = await Test.createTestingModule({
    providers: [SubscriptionRepairService],
  }).compile();
  return moduleRef.get(SubscriptionRepairService);
}

describe("SubscriptionRepairService", () => {
  it("repoints roleIds, skillIds, and excludedSkillIds that held the merged-away id", async () => {
    const svc = await bootstrap();
    const executor = mockExecutor(
      [DST],
      [
        {
          id: "sub-1",
          is_active: true,
          role_ids: [SRC],
          skill_ids: [SRC, OTHER],
          excluded_skill_ids: [SRC],
        },
      ],
    );

    const out = await svc.repointMergedNodes(executor as never, new Map([[SRC, DST]]));

    expect(out).toEqual({ inspected: 1, rewritten: 1, narrowed: [], wouldSilence: [] });
    const updateCalls = executor.execute.mock.calls.slice(2);
    expect(updateCalls).toHaveLength(1);
  });

  it("drops an id whose node is neither remapped nor VERIFIED any more", async () => {
    const svc = await bootstrap();
    // OTHER has no remap entry and is not in the verified set — a hide or an
    // earlier, unrelated merge left it dead. Should be dropped, not kept.
    const executor = mockExecutor(
      [DST],
      [
        {
          id: "sub-1",
          is_active: false,
          role_ids: null,
          skill_ids: [OTHER],
          excluded_skill_ids: null,
        },
      ],
    );

    const out = await svc.repointMergedNodes(executor as never, new Map([[SRC, DST]]));

    expect(out.rewritten).toBe(1);
  });

  it("refuses to empty an active subscription's roleIds/skillIds arm", async () => {
    const svc = await bootstrap();
    // The only role this active sub matched on is gone with no successor —
    // repairing straight through would silently turn it into "matches
    // everything". Leave it for a human instead.
    const executor = mockExecutor(
      [DST],
      [
        {
          id: "sub-1",
          is_active: true,
          role_ids: [SRC],
          skill_ids: null,
          excluded_skill_ids: null,
        },
      ],
    );

    const out = await svc.repointMergedNodes(executor as never, new Map());

    expect(out).toEqual({ inspected: 1, rewritten: 0, narrowed: [], wouldSilence: ["sub-1"] });
  });

  it("does not refuse when only excludedSkillIds would empty — that un-hides, it doesn't silence", async () => {
    const svc = await bootstrap();
    const executor = mockExecutor(
      [DST],
      [
        {
          id: "sub-1",
          is_active: true,
          role_ids: null,
          skill_ids: null,
          excluded_skill_ids: [SRC],
        },
      ],
    );

    const out = await svc.repointMergedNodes(executor as never, new Map());

    expect(out.wouldSilence).toEqual([]);
    expect(out.rewritten).toBe(1);
    expect(out.narrowed[0]).toContain("was hiding, now visible");
  });

  it("leaves a subscription untouched when none of its arms reference a stale id", async () => {
    const svc = await bootstrap();
    const executor = mockExecutor(
      [DST, OTHER],
      [
        {
          id: "sub-1",
          is_active: true,
          role_ids: [DST],
          skill_ids: [OTHER],
          excluded_skill_ids: null,
        },
      ],
    );

    const out = await svc.repointMergedNodes(executor as never, new Map([[SRC, DST]]));

    expect(out).toEqual({ inspected: 1, rewritten: 0, narrowed: [], wouldSilence: [] });
  });
});
