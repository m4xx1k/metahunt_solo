// Eval-only companion to extract-vacancy.baml. It intentionally does not alter
// the production ExtractVacancy contract or its stored `skills` shape.

enum RequirementPriority {
  MUST
  NICE
}

// Closed role-v2 evaluation vocabulary. These are disciplines, not levels,
// leadership titles, languages, frameworks, or products.
enum RequirementsV2Role {
  AI_ENGINEER @alias("AI Engineer")
  ANDROID_ENGINEER @alias("Android Engineer")
  AUTOMATION_QA_ENGINEER @alias("Automation QA Engineer")
  BACKEND_ENGINEER @alias("Backend Engineer")
  BLOCKCHAIN_ENGINEER @alias("Blockchain Engineer")
  BUSINESS_ANALYST @alias("Business Analyst")
  COMPUTER_VISION_ENGINEER @alias("Computer Vision Engineer")
  CROSS_PLATFORM_MOBILE_ENGINEER @alias("Cross-platform Mobile Engineer")
  DATA_ANALYST @alias("Data Analyst")
  DATA_ENGINEER @alias("Data Engineer")
  DATA_SCIENTIST @alias("Data Scientist")
  DATABASE_ENGINEER @alias("Database Engineer")
  DEVOPS_ENGINEER @alias("DevOps Engineer")
  EMBEDDED_ENGINEER @alias("Embedded Engineer")
  ERP_CRM_ENGINEER @alias("ERP / CRM Engineer")
  FPGA_ENGINEER @alias("FPGA Engineer")
  FRONTEND_ENGINEER @alias("Frontend Engineer")
  FULL_STACK_ENGINEER @alias("Full Stack Engineer")
  GAME_ENGINEER @alias("Game Engineer")
  HARDWARE_ENGINEER @alias("Hardware Engineer")
  IOS_ENGINEER @alias("iOS Engineer")
  IT_SUPPORT_ENGINEER @alias("IT Support Engineer")
  MACHINE_LEARNING_ENGINEER @alias("Machine Learning Engineer")
  MANUAL_QA_ENGINEER @alias("Manual QA Engineer")
  NETWORK_ENGINEER @alias("Network Engineer")
  SECURITY_ENGINEER @alias("Security Engineer")
  SYSTEMS_ADMINISTRATOR @alias("Systems Administrator")
  WEB_CMS_ENGINEER @alias("Web / CMS Engineer")
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
  role RequirementsV2Role? @description(#"
    Technical DISCIPLINE / job function, never seniority or leadership.
    Use null when no listed discipline fits. Do not invent a language-,
    framework-, product-, Lead-, Architect-, CTO-, VP-, or Head-based role.

    Preserve the underlying discipline for Lead and Architect titles. An
    Architect is not automatically a Principal. Generic Software Engineer is
    not a fallback when a more specific discipline is identifiable.
  "#)

  isTech bool @description(#"
    TRUE for technical/engineering roles: software development, QA,
    DevOps/SRE, data, security, embedded, or engineering management. FALSE
    for non-tech roles such as sales, recruiting, marketing, design, finance,
    legal, support, product, or project management.
  "#)

  seniority Seniority? @description(#"
    Junior / Middle / Senior in the title wins. Use LEAD only for an actual
    people or technical-function lead role. Architect alone does not imply
    PRINCIPAL; use PRINCIPAL only with explicit principal-level ownership
    across a domain or organization. Use C_LEVEL only for a technical
    executive role. Otherwise use null.
  "#)

  requirements VacancyRequirementV2[] @description(#"
    Every explicit hard technical requirement from the posting. Include named
    tools, languages, frameworks, cloud providers, methodologies (TDD, BDD,
    API Testing, System Design), and concrete technical concepts. A requirement
    can appear under Requirements / Skills or as a concrete technology the
    candidate is explicitly expected to use in duties. Do not infer it merely
    from the product, company, domain, or surrounding context.

    Exclude soft skills, generic duties without a technical capability,
    English, years of experience, salary, location, and company marketing.

    Keep `must` vs `nice` faithfully. Preserve every explicit `A or B` choice
    as one `anyOf` requirement. A singleton and an `anyOf` group may both be
    correct when the source states them as separate requirements.

    Deduplicate equivalent spellings: JS → JavaScript, TS → TypeScript,
    React.js → React, Vue js → Vue.js, K8s → Kubernetes. Keep distinct
    technologies distinct even when they are related (MySQL != MariaDB,
    JavaScript != TypeScript). Prefer concise market-standard English names.
  "#)
}

function ExtractVacancyRequirementsV2(text: string) -> ExtractedVacancyRequirementsV2 {
  client DeepSeekClient
  prompt #"
    You extract only the Requirements v2 contract from a job posting for the
    Ukrainian IT market. Return exactly the requested schema; use null when
    role or seniority is genuinely unknown.

    Evidence rules:
      - Extract all explicit hard-technical qualifications and concrete
        technologies the candidate is explicitly expected to use.
      - Do not infer a requirement from project stack or company context.
      - A local qualifier (optional / preferred / plus) overrides a surrounding
        Requirements heading.

    Priority rules:
      - Required / must-have / "we need" / unqualified item under Requirements
        or Required Skills → MUST.
      - Nice to have / plus / preferred / optional / advantage → NICE.

    Alternative rules:
      - Preserve one logical choice as one `anyOf`: "AWS or GCP", "one of A/B",
        "A and/or B", or "any framework: A, B, C".
      - Do not use `anyOf` for a list where every item is required.
      - A comma-separated stack is cumulative unless the text explicitly marks
        it as alternatives.
      - Never split one choice into singleton requirements.
      - A separately stated singleton and a later `anyOf` containing it may
        both be correct; they represent different source statements.

    Examples:
      Required: AWS or GCP. Terraform is a plus.
      -> MUST anyOf [AWS, GCP]; NICE Terraform.

      Requirements: JavaScript and TypeScript. React, Vue, or Angular.
      -> MUST JavaScript; MUST TypeScript; MUST anyOf [React, Vue.js, Angular].

      Requirements: AWS, Azure, SQL. Experience applying TDD or BDD.
      -> MUST AWS; MUST Azure; MUST SQL; MUST anyOf [TDD, BDD].

      We build on Kubernetes. You must administer Linux.
      -> MUST Linux only; Kubernetes is project context, not a requirement.

      We work in Agile. Experience with CI/CD is required.
      -> MUST CI/CD only; Agile describes company process, not a requirement.

    {{ ctx.output_format }}

    Posting:
    {{ text }}
  "#
}

test requirements_v2_or_boundary {
  functions [ExtractVacancyRequirementsV2]
  args {
    text "Senior DevOps Engineer. Required: AWS or GCP, Docker or Kubernetes. Terraform is a plus."
  }
}
