// MOCK DATA for the roles + excludes steps — local state only, no fake API
// calls. Types mirror the planned `GET /cv/:id/role-suggestions` contract
// (design: .scratch/cv-match-flow-design.md §1.1) so wiring the real endpoint
// later is a data-source swap, not a refactor.

export interface RoleSuggestion {
  roleId: string;
  /** Feed filter slug — becomes `?roles=` once the role filter ships. */
  slug: string;
  name: string;
  /** Laplace-smoothed share of the role's vacancies at GOOD+ for this profile. */
  score: number;
  goodCount: number;
  totalCount: number;
  /** True when the role was claimed in the CV — pinned first regardless of score. */
  pinned: boolean;
  preselected: boolean;
}

export const MOCK_ROLE_SUGGESTIONS: RoleSuggestion[] = [
  {
    roleId: "mock-backend",
    slug: "backend-engineer",
    name: "Backend Engineer",
    score: 0.4,
    goodCount: 124,
    totalCount: 310,
    pinned: true,
    preselected: true,
  },
  {
    roleId: "mock-fullstack",
    slug: "full-stack-engineer",
    name: "Full Stack Engineer",
    score: 0.37,
    goodCount: 89,
    totalCount: 240,
    pinned: false,
    preselected: true,
  },
  {
    roleId: "mock-python",
    slug: "python-engineer",
    name: "Python Engineer",
    score: 0.54,
    goodCount: 42,
    totalCount: 78,
    pinned: false,
    preselected: true,
  },
  {
    roleId: "mock-data",
    slug: "data-engineer",
    name: "Data Engineer",
    score: 0.33,
    goodCount: 31,
    totalCount: 95,
    pinned: false,
    preselected: false,
  },
  {
    roleId: "mock-devops",
    slug: "devops-engineer",
    name: "DevOps Engineer",
    score: 0.15,
    goodCount: 18,
    totalCount: 120,
    pinned: false,
    preselected: false,
  },
];

// Fallback name for the excludes-step "⚠️ вимагає X" badge preview when the
// visitor hasn't excluded anything yet.
export const MOCK_EXCLUDE_PREVIEW_SKILL = "react";
