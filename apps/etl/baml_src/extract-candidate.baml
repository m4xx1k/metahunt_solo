// Candidate (CV) extraction — counterpart of extract-vacancy.baml.
// Reuses the Seniority / EnglishLevel enums and the Skills class defined there
// (BAML types are global across baml_src). The TS type ExtractedCandidate is
// generated into apps/etl/src/baml_client/types.ts.

// A CV lists far more skills than a single vacancy asks for — use a wider cap
// than the vacancy `Skills` class so matching has enough surface to rank on.
class CandidateSkills {
  required string[] @description(#"
    Core hard technical skills the candidate clearly has hands-on experience
    with (skills sections + technologies named across experience bullets).
    Languages, frameworks, databases, cloud, infra tools. MAX 30 entries.
    Use canonical English names as written in the Ukrainian IT market.

    EXCLUDE: soft skills, generic categories, process methodologies
    (Scrum/Agile/unit testing), universal protocols (HTTP/JSON/REST as a
    concept), and tools every dev uses (git, terminal, IDE).
    DEDUPLICATE forms (react + react.js → React; node + node.js → Node.js).
  "#)
  optional string[] @description(#"
    Secondary / familiar-with skills mentioned in passing. Same EXCLUDE /
    DEDUPLICATE rules. MAX 15 entries.
  "#)
}

class ExtractedCandidate {
  role string? @description(#"
    Candidate's primary canonical role WITHOUT seniority prefix, inferred from
    their most recent / dominant experience.
    Examples: "Frontend Developer", "Backend Developer", "Full Stack Developer",
    "DevOps Engineer", "QA Engineer", "Data Engineer", "ML Engineer".

    PREFER umbrella roles over hyper-specific ones, same as for vacancies:
      "Senior React dev"          → "Frontend Developer"
      "Python / Django engineer"  → "Backend Developer"
      "Node.js Full Stack"        → "Full Stack Developer"

    If a canonical name from the prompt's `knownRoles` list fits — use it with
    EXACT spelling. null only if the CV is not a software / tech CV at all.
  "#)

  seniority Seniority? @description(#"
    Overall seniority inferred from years of experience and role titles held.
    Rules:
      1. An explicit current title (Junior / Middle / Senior / Lead / Architect)
         wins.
      2. "Architect" → PRINCIPAL. "Head of" / "VP" / "CTO" → C_LEVEL.
      3. Otherwise infer from total years: <1 INTERN, 1-2 JUNIOR, 2-4 MIDDLE,
         4-7 SENIOR, 7+ LEAD — but defer to explicit titles.
      4. null if it genuinely cannot be inferred.
  "#)

  skills CandidateSkills @description(#"
    Hard technical skills the candidate KNOWS, pulled from skills sections AND
    from technologies named in their experience bullets. Be generous on
    `required` — capture the candidate's real stack, not just the headline few.
  "#)

  experienceYears float? @description(#"
    Total years of commercial software experience.
    Sum across roles if a range of dates is given; round to whole years.
    null if it cannot be determined.
  "#)

  englishLevel EnglishLevel? @description(#"
    Candidate's English level if stated.
      A1/A2 → BEGINNER, B1 → INTERMEDIATE, B2 → UPPER_INTERMEDIATE,
      C1/C2 → ADVANCED, native → NATIVE.
    null if not mentioned.
  "#)
}

function ExtractCandidate(
  text: string,
  knownRoles: string,
  knownDomains: string,
) -> ExtractedCandidate {
  client OpenAIClient
  prompt #"
    You extract structured data from a software engineer's CV / resume for the
    Ukrainian IT market. Read the CV and produce a value matching the schema.
    Follow each field's description literally. Use null when uncertain.

    Context — Ukrainian IT market specifics:
      - CVs are mixed-language (Ukrainian + Russian + English). Translate
        skill / role names to English; keep canonical English forms.
      - Extract skills the candidate HAS, not skills a job wants.

    PREFER these canonical ROLE names. Use EXACT spelling when applicable.
    If none fit, use a clear role name; do NOT invent variant spellings.
    Canonical roles:
    {{ knownRoles }}

    {{ ctx.output_format }}

    CV:
    {{ text }}
  "#
}

test cv_fullstack {
  functions [ExtractCandidate]
  args {
    text #"
      Maksym — Full-Stack Engineer, 4+ years.
      Skills: TypeScript, React, Node.js, NestJS, PostgreSQL, Docker, AWS.
      Experience: built NestJS + GraphQL + PostgreSQL product flows; OpenAI
      tool-calling; Elasticsearch hybrid search. English: B2.
    "#
    knownRoles "Backend Developer, Frontend Developer, Full Stack Developer, DevOps Engineer, QA Engineer"
    knownDomains "Fintech, E-commerce, HealthTech, GameDev"
  }
}
