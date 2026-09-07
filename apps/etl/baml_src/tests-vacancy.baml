// Test fixtures for ExtractVacancy — kept OUT of extract-vacancy.baml on
// purpose: scripts/check-baml-production-identity.mjs hashes that file whole,
// so an in-file `test` block would bust every extraction_artifacts cache row.
// These run against the real LLM via `pnpm --filter @metahunt/etl baml:test`;
// the automated gate assertion lives in baml.extractor.spec.ts.

// The named-practice gate (Phase C): a practice is emitted ONLY on an exact
// verbatim match in knownSkills. Microservices / CI/CD / RAG are listed and
// the body requires all three → expected in skills.required. "event-driven"
// is deliberately absent from knownSkills → must be dropped, not coerced to
// "Event-Driven Architecture" or minted as a new node.
test vacancy_concepts_gated {
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

// The inverse: when the listed practice IS present it must come through. Same
// body, but Event-Driven Architecture is now on the list → all four practices
// expected alongside the concrete tech.
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
