import { z } from "zod";

const seniority = z.enum(["INTERN", "JUNIOR", "MIDDLE", "SENIOR", "LEAD", "PRINCIPAL", "C_LEVEL"]);

export const goldenSetCaseSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  slice: z.string(),
  source: z.enum(["synthetic_contract_fixture", "production_candidate"]),
  text: z.string().min(1),
  expected: z.object({
    isTech: z.boolean(),
    role: z.string().nullable(),
    seniority: seniority.nullable(),
  }),
  rationale: z.string().min(1),
  reviewStatus: z.enum(["draft", "approved", "rejected"]),
});

export const goldenSetSchema = z.object({
  schemaVersion: z.literal(1),
  contract: z.literal("role-contract-v1"),
  taxonomySource: z.literal("live-verified-at-eval-time"),
  cases: z.array(goldenSetCaseSchema).min(1),
});

export type GoldenSet = z.infer<typeof goldenSetSchema>;
export type GoldenSetCase = z.infer<typeof goldenSetCaseSchema>;
