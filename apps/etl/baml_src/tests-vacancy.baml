// Test fixtures for ExtractVacancy — kept OUT of extract-vacancy.baml on
// purpose: scripts/check-baml-production-identity.mjs hashes that file whole,
// so an in-file `test` block would bust every extraction_artifacts cache row.
// These run against the real LLM via `pnpm --filter @metahunt/etl baml:test`;
// the automated gate assertion lives in baml.extractor.spec.ts.

// The named-practice bar (R10): knownSkills is the canonical spelling, not a
// whitelist. Microservices / CI/CD / RAG are listed → expected verbatim.
// "event-driven" is deliberately absent → still expected, but under its
// market-standard name "Event-Driven Architecture", never as "event-driven".
// "Agile" / "Scrum" stay out: process, not a skill, list or no list.
test vacancy_concepts_unlisted {
  functions [ExtractVacancy]
  args {
    text #"
      Title: Senior Backend Engineer

      We run event-driven microservices with CI/CD pipelines and are building
      a RAG pipeline over our docs. Stack: Go, PostgreSQL, Kafka, AWS.
      Agile/Scrum team, 5+ years required. English B2.
    "#
    knownRoles "Backend Developer, Frontend Developer, Full Stack Developer, DevOps Engineer, QA Engineer, ML Engineer, Data Engineer"
    knownDomains "Fintech, E-commerce, HealthTech, GameDev"
    knownSkills "Go, PostgreSQL, Kafka, AWS, Microservices, CI/CD, RAG"
  }
}

// The inverse: when the practice IS on the list, the output must use that
// spelling character for character. Same body, Event-Driven Architecture now
// listed → all four practices expected alongside the concrete tech.
test vacancy_concepts_listed {
  functions [ExtractVacancy]
  args {
    text #"
      Title: Senior Backend Engineer

      We run event-driven microservices with CI/CD pipelines and are building
      a RAG pipeline over our docs. Stack: Go, PostgreSQL, Kafka, AWS.
      Agile/Scrum team, 5+ years required. English B2.
    "#
    knownRoles "Backend Developer, Frontend Developer, Full Stack Developer, DevOps Engineer, QA Engineer, ML Engineer, Data Engineer"
    knownDomains "Fintech, E-commerce, HealthTech, GameDev"
    knownSkills "Go, PostgreSQL, Kafka, AWS, Microservices, CI/CD, RAG, Event-Driven Architecture"
  }
}
