// ATS is a local operator surface, separate from the public deduplicated feed.
// Keep these wire types hand-mirrored with ats-boards.controller.ts until a
// second client makes a shared contracts package worthwhile.

import { apiGet, buildQs } from "./client";

export type AtsStatus = "open" | "closed" | "all";

export interface AtsJob {
  id: string;
  title: string;
  companyName: string;
  companySlug: string | null;
  atsType: string;
  boardSlug: string | null;
  link: string | null;
  locations: unknown;
  workFormat: "REMOTE" | "OFFICE" | "HYBRID" | null;
  seniority: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  salaryPeriod: "HOUR" | "MONTH" | "YEAR" | null;
  salarySource: "ATS_STRUCTURED" | "LLM_TEXT" | null;
  publishedAt: string | null;
  closedAt: string | null;
  status: "OPEN" | "CLOSED";
  isUa: boolean;
  hasDuplicate: boolean;
  needsReview: boolean;
}

export interface AtsJobsResponse {
  items: AtsJob[];
  total: number;
  limit: number;
  offset: number;
}

export interface AtsOverview {
  totals: {
    boards: number;
    jobs: number;
    openJobs: number;
    closedJobs: number;
    uaJobs: number;
    remoteJobs: number;
    duplicateCandidates: number;
  };
  fieldCoverage: Array<{ field: string; filled: number; total: number }>;
  problemBoards: Array<{
    name: string;
    atsType: string;
    boardSlug: string | null;
    jobs: number;
    locationJobs: number;
    workFormatJobs: number;
    directUrlJobs: number;
    issue: string;
  }>;
}

export const atsApi = {
  jobs: (
    params: {
      q?: string;
      status?: AtsStatus;
      uaOnly?: boolean;
      remoteOnly?: boolean;
      reviewOnly?: boolean;
      limit?: number;
      offset?: number;
    } = {},
  ) =>
    apiGet<AtsJobsResponse>(
      `/ats/jobs${buildQs({
        q: params.q,
        status: params.status,
        uaOnly: params.uaOnly || undefined,
        remoteOnly: params.remoteOnly || undefined,
        reviewOnly: params.reviewOnly || undefined,
        limit: params.limit,
        offset: params.offset,
      })}`,
      { cache: "no-store" },
    ),
  overview: () => apiGet<AtsOverview>("/ats/overview", { cache: "no-store" }),
};
