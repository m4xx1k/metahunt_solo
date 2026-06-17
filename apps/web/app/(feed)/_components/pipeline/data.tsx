// Copy + sample data for the 3-stage explainer band on the feed index.
// Everything textual lives here so it can be swapped (e.g. to EN) in one place.
// The three stages rhyme in Ukrainian (Збір → Розбір → Підбір) and map to
// Collect → Parse → Match. Live numbers (source list, totals) are NOT here —
// they come from `aggregates` at render time so we never invent counts.
//
// Stage 3's dedup story is folded into stage 2's lead, not its own pillar.

export type PipelineAccent = "secondary" | "accent" | "success";

// Sample CV-Match verdict — mirrors the real RankedVacancy.diff (have/missing/
// bonus) + fit tier shown on the reverse-ats MatchCard, just with static skills.
export interface PipelineMatch {
  fit: string;
  matched: number;
  required: number;
  have: string[]; // must-have skills the CV covers
  missing: string[]; // must-have skills the CV lacks
  bonus: string[]; // nice-to-have skills the CV happens to cover
}

export const pipeline = {
  tag: "як це працює",
  steps: {
    collect: {
      n: "01",
      title: "Збір",
      lead: "Усі джерела зливаються в один потік — щогодини, цілодобово.",
      accent: "secondary" as PipelineAccent,
    },
    parse: {
      n: "02",
      title: "Розбір",
      lead: "LLM читає кожне оголошення й розкладає на поля. Дублікати — в одну картку.",
      accent: "accent" as PipelineAccent,
    },
    match: {
      n: "03",
      title: "Підбір",
      lead: "Завантаж резюме — і фід ранжується під твій профіль.",
      accent: "success" as PipelineAccent,
    },
  },
  // Sample fields the parser pulls out — illustrative, shown as popping tags.
  extracted: ["Python", "Senior", "Remote", "$4000+", "тестове"],
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
