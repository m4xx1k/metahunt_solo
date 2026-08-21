// Eval-only companion to extract-vacancy.baml. It intentionally does not alter
// the production ExtractVacancy contract or its stored `skills` shape.

enum RequirementPriority {
  MUST
  NICE
}

class VacancyRequirementV2 {
  priority RequirementPriority @description(#"
    `MUST` only when the posting explicitly requires the item. `NICE` only
    when it is explicitly a plus, preferred, optional, or nice-to-have.
  "#)
  value string? @description(#"
    One required capability, tool, methodology, or named technical concept.
    Use this for a single requirement. Exactly one of `value` or `anyOf` must
    be present.
  "#)
  anyOf string[]? @description(#"
    One logical requirement with explicit alternatives, such as "AWS or GCP".
    Preserve it as a SINGLE item, in the original alternatives' canonical
    English forms. Do not turn it into multiple singleton requirements.
    Exactly one of `value` or `anyOf` must be present; `anyOf` needs 2+ items.
  "#)
}

class ExtractedVacancyRequirementsV2 {
  role string? @description(#"
    Canonical technical role without seniority. Prefer an EXACT name from
    `knownRoles`; null only for a non-tech posting.
  "#)

  isTech bool @description(#"
    TRUE for technical/engineering roles: software development, QA,
    DevOps/SRE, data, security, embedded, or engineering management. FALSE
    for non-tech roles such as sales, recruiting, marketing, design, finance,
    legal, support, product, or project management.
  "#)

  seniority Seniority? @description(#"
    Infer from the title first: Junior, Middle, Senior, Lead, Architect, Head
    of. Use null when it cannot be determined.
  "#)

  requirements VacancyRequirementV2[] @description(#"
    The explicit technical requirements from the posting. Include named tools,
    languages, frameworks, cloud providers, methodologies (TDD, BDD, API
    Testing, System Design), and concrete technical concepts when the posting
    asks for them. Do NOT include soft skills, generic work duties, English
    level, years of experience, salary, location, or company marketing.

    Keep `must` vs `nice` faithfully. Preserve every explicit `A or B` choice
    as one `anyOf` requirement. A singleton and an `anyOf` group may both be
    correct when the source states them as separate requirements.

    Deduplicate equivalent spellings: JS → JavaScript, TS → TypeScript,
    React.js → React, K8s → Kubernetes. When a value matches `knownSkills`,
    use its EXACT spelling. MAX 20 must and 10 nice items.
  "#)
}

function ExtractVacancyRequirementsV2(
  text: string,
  knownRoles: string,
  knownSkills: string,
) -> ExtractedVacancyRequirementsV2 {
  client DeepSeekClient
  prompt #"
    You extract only the Requirements v2 contract from a job posting for the
    Ukrainian IT market. Return exactly the requested schema; use null when
    role or seniority is genuinely unknown.

    The key correctness rule: preserve explicit alternatives. For "AWS or GCP
    is required", output one item `{ priority: MUST, anyOf: ["AWS", "GCP"] }`.
    Never output separate MUST items for AWS and GCP in that case.

    Priority rules:
      - Required / must-have / "we need" / listed under Requirements → MUST.
      - Nice to have / plus / preferred / optional / advantage → NICE.
      - Do not invent requirements from responsibilities or company context.

    Output named technical methodologies and concepts if explicitly requested:
    TDD, BDD, API Testing, System Design, Data Pipelines, Testing, etc. Do not
    discard them merely because they are not programming languages or tools.

    PREFER these canonical ROLE names. Use their EXACT spelling when applicable:
    {{ knownRoles }}

    PREFER these canonical SKILL names. Other clear technical terms are also
    allowed, in their market-standard English form:
    {{ knownSkills }}

    {{ ctx.output_format }}

    Posting:
    {{ text }}
  "#
}

test requirements_v2_or_boundary {
  functions [ExtractVacancyRequirementsV2]
  args {
    text "Senior DevOps Engineer. Required: AWS or GCP, Docker or Kubernetes. Terraform is a plus."
    knownRoles "DevOps Engineer"
    knownSkills "AWS, GCP, Docker, Kubernetes, Terraform"
  }
}
