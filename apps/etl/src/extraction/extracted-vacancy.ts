import { z } from "zod";

export const ExtractedVacancy = z.object({
  salary_min: z.number().nullable(),
  salary_max: z.number().nullable(),
  salary_currency: z.string().nullable(),
  experience_years_min: z.number().nullable(),
  experience_years_max: z.number().nullable(),
  employment_type: z
    .enum(["full-time", "part-time", "contract", "freelance"])
    .nullable(),
  work_format: z.enum(["remote", "office", "hybrid"]).nullable(),
  skills: z.array(z.string()),
  english_level: z.string().nullable(),
  seniority: z
    .enum(["intern", "junior", "middle", "senior", "lead", "principal"])
    .nullable(),
  specialization: z.string().nullable(),
});

export type ExtractedVacancy = z.infer<typeof ExtractedVacancy>;

export const EXTRACT_VACANCY_JSON_SCHEMA = {
  type: "object" as const,
  properties: {
    salary_min: { type: ["number", "null"] },
    salary_max: { type: ["number", "null"] },
    salary_currency: { type: ["string", "null"] },
    experience_years_min: { type: ["number", "null"] },
    experience_years_max: { type: ["number", "null"] },
    employment_type: {
      type: ["string", "null"],
      enum: ["full-time", "part-time", "contract", "freelance", null],
    },
    work_format: {
      type: ["string", "null"],
      enum: ["remote", "office", "hybrid", null],
    },
    skills: { type: "array", items: { type: "string" } },
    english_level: { type: ["string", "null"] },
    seniority: {
      type: ["string", "null"],
      enum: [
        "intern",
        "junior",
        "middle",
        "senior",
        "lead",
        "principal",
        null,
      ],
    },
    specialization: { type: ["string", "null"] },
  },
  required: [
    "salary_min",
    "salary_max",
    "salary_currency",
    "experience_years_min",
    "experience_years_max",
    "employment_type",
    "work_format",
    "skills",
    "english_level",
    "seniority",
    "specialization",
  ],
};
