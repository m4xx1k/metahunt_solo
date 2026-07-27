import { z } from "zod";

import {
  cleanLocations,
  normalizeEmploymentType,
  normalizeRemote,
  type AtsAdapter,
  type NormalizedItem,
  type NormalizedSalary,
} from "../ats.contract";

// Hurma is a Ukrainian ATS (hurma.work). It differs from the US boards in
// every dimension that costs adapter effort — see the notes on each field —
// which is why it is here: it is the honest measurement of what a marginal
// adapter costs, rather than a fourth variation on the same theme.

// PHP `json_encode` renders an empty associative array as `[]` and a populated
// one as an object, so this field's *type* changes with its emptiness.
const HurmaSalary = z.union([
  z.array(z.unknown()),
  z.object({
    from: z.number().nullish(),
    to: z.number().nullish(),
    currency: z.string().nullish(),
  }),
]);

const HurmaVacancy = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string(),
  description: z.string().nullish(),
  responsibility: z.string().nullish(),
  working_conditions: z.string().nullish(),
  addition: z.string().nullish(),
  residence: z.string().nullish(),
  company_name: z.string().nullish(),
  work_types: z.array(z.string()).nullish(),
  salary: HurmaSalary.nullish(),
  experience: z.string().nullish(),
  created_at: z.string().nullish(),
  open_date: z.string().nullish(),
  published: z.unknown().nullish(),
});

// Laravel paginator envelope.
const HurmaBoard = z.object({
  result: z.object({
    data: z.array(HurmaVacancy),
    current_page: z.number().nullish(),
    last_page: z.number().nullish(),
    total: z.number().nullish(),
  }),
});

function toSalary(salary: z.infer<typeof HurmaVacancy>["salary"]): NormalizedSalary | null {
  if (!salary || Array.isArray(salary)) return null;
  if (salary.from == null && salary.to == null) return null;
  return {
    min: salary.from ?? null,
    max: salary.to ?? null,
    currency: salary.currency ?? null,
    // Ukrainian postings quote a monthly figure; the API never says so.
    interval: "MONTH",
    raw: JSON.stringify(salary),
  };
}

// The posting body is spread across four fields; sending only `description`
// to the extractor would drop the requirements the LLM needs most.
function toDescription(v: z.infer<typeof HurmaVacancy>): string {
  return [v.description, v.responsibility, v.working_conditions, v.addition]
    .filter((part): part is string => Boolean(part?.trim()))
    .join("\n\n");
}

// "2025-12-08 12:55:09" — no zone, no `T`. Treating it as UTC would shift every
// Ukrainian posting by 2-3 hours; Hurma is a Kyiv product serving Kyiv clients.
function parseKyivTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  const [, y, mo, d, h, mi, s] = match;
  // Kyiv is UTC+2 in winter, UTC+3 in summer; derive it rather than hardcode.
  const asUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  const offsetMinutes = kyivOffsetMinutes(new Date(asUtc));
  return new Date(asUtc - offsetMinutes * 60_000);
}

function kyivOffsetMinutes(at: Date): number {
  const local = new Date(at.toLocaleString("en-US", { timeZone: "Europe/Kyiv" }));
  const utc = new Date(at.toLocaleString("en-US", { timeZone: "UTC" }));
  return Math.round((local.getTime() - utc.getTime()) / 60_000);
}

export const hurmaAdapter: AtsAdapter = {
  type: "hurma",

  boardUrl(slug) {
    return `https://${encodeURIComponent(slug)}.hurma.work/api/vacancies`;
  },

  toItems(payload, slug) {
    const board = HurmaBoard.parse(payload);

    return board.result.data.map((vacancy) => {
      const workTypes = vacancy.work_types ?? [];
      // One array carries both axes: "Повна зайнятість" is an employment type,
      // "Віддалена" is a work format. Read each without assuming position.
      const remote = workTypes.map((t) => normalizeRemote(t)).find((r) => r !== null) ?? null;
      const employmentType =
        workTypes.map((t) => normalizeEmploymentType(t)).find((t) => t !== null) ?? null;

      return {
        externalId: String(vacancy.id),
        title: vacancy.name,
        descriptionHtml: toDescription(vacancy),
        // Constructed, not returned by the API. Logged-out hits currently
        // redirect to /login on some tenants — link validity is an open
        // question before Hurma ships (a dead apply link is worse than no row).
        link: `https://${slug}.hurma.work/vacancies/${vacancy.id}`,
        publishedAt: parseKyivTimestamp(vacancy.open_date ?? vacancy.created_at),
        locations: cleanLocations([vacancy.residence]),
        isRemote: remote,
        employmentType,
        // `department_id` is a numeric tenant-local id with no name anywhere in
        // the payload, so the TECH/NONTECH department gate cannot run on Hurma
        // — `passesTechGate` falls back to title-only for this source.
        department: null,
        team: null,
        salary: toSalary(vacancy.salary),
      };
    }) satisfies NormalizedItem[];
  },
};

/** Hurma paginates; the other three boards return everything in one call. */
export function hurmaNextPageUrl(payload: unknown, slug: string): string | null {
  const board = HurmaBoard.parse(payload);
  const { current_page: current, last_page: last } = board.result;
  if (current == null || last == null || current >= last) return null;
  return `${hurmaAdapter.boardUrl(slug)}?page=${current + 1}`;
}
