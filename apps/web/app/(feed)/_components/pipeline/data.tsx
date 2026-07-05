// Copy + sample data for the 3-stage explainer band on the feed index.
// Everything textual lives here so it can be swapped in one place. Stages map to
// Collect → Parse → Match. Live numbers (source list, totals) are NOT here —
// they come from `aggregates` at render time so we never invent counts.

export type PipelineAccent = "secondary" | "accent" | "success";

// Sample CV-Match verdict — mirrors the real RankedVacancy.diff (have/missing/
// bonus) + fit tier shown on the ranked match cards, just with static skills.
export interface PipelineMatch {
  fit: string;
  matched: number;
  required: number;
  have: string[]; // must-have skills the CV covers
  missing: string[]; // must-have skills the CV lacks
  bonus: string[]; // nice-to-have skills the CV happens to cover
}

export const pipeline = {
  tag: "how it works",
  steps: {
    collect: {
      n: "01",
      title: "Collect",
      lead: "Every source flows into one stream — hourly, around the clock.",
      accent: "secondary" as PipelineAccent,
    },
    parse: {
      n: "02",
      title: "Parse",
      lead: "An LLM reads each posting and breaks it into fields. Duplicates merge into one card.",
      accent: "accent" as PipelineAccent,
    },
    match: {
      n: "03",
      title: "Match",
      lead: "Upload your CV — the feed re-ranks itself around your profile.",
      accent: "success" as PipelineAccent,
      cta: { label: "try CV-Match", href: "/" },
    },
  },
  // Sample fields the parser pulls out — illustrative, shown as popping tags.
  extracted: ["Python", "Senior", "Remote", "$4000+", "Test task"],
  // Sample CV-Match verdict — illustrative skill diff in the matching stage.
  match: {
    fit: "good fit",
    matched: 3,
    required: 5,
    have: ["Python", "FastAPI", "PostgreSQL"],
    missing: ["Kubernetes", "Go"],
    bonus: ["Docker", "AWS"],
  } satisfies PipelineMatch,
};
