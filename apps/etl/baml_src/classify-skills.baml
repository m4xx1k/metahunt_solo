// Skill classification for reverse-ATS recommendation gates. Encodes the rubric
// in .scratch/skill-weighting/classify-rubric.md. Output is loaded into
// node_tech_meta by the classify-skills backfill CLI (one-off, VERIFIED skills).
// See md/journal/migrations/skill-metadata-recommendations.md (Population).

enum SkillCategory {
  LANGUAGE  @description("programming/query languages: Go, Java, Python, SQL, TypeScript, Swift, C#")
  FRAMEWORK @description("app frameworks defining how you build: Spring Boot, NestJS, React, Django, .NET, Selenium")
  LIBRARY   @description("narrower libs/SDKs: Redux, GraphQL, Combine, RestAssured, FFmpeg, Prisma")
  DATASTORE @description("DBs, caches, brokers, search: PostgreSQL, Redis, Kafka, MongoDB, ElasticSearch, RabbitMQ")
  CLOUD     @description("cloud platforms & managed infra: AWS, Azure, GCP, Lambda, SQS, Railway")
  TOOL      @description("dev/ops tooling: Docker, Kubernetes, Git, Terraform, Jira, Postman, Grafana, Xcode")
  PRACTICE  @description("methods/concepts: CI/CD, Microservices, REST API, Agile, TDD, ETL, OOP")
  SOFT      @description("communication/process/language skills: English, Mentoring, Leadership")
}

class SkillToClassify {
  nodeId string
  name string
}

class ClassifiedSkill {
  nodeId string @description(#"Copy verbatim from the input skill (the UUID)."#)
  category SkillCategory
  stack string? @description(#"
    The developer specialization this skill *belongs to*, or null if stack-neutral.
    Controlled vocabulary (use exactly, lowercase), else null:
    node python java dotnet go php ruby cpp rust frontend mobile-ios
    mobile-android mobile-cross qa data devops blockchain game
    Assign a concrete stack ONLY to skills defining/idiomatic to ONE specialization:
      Go->go, Spring Boot->java, NestJS/Express.js->node, Django/FastAPI->python,
      React/Vue/Angular->frontend, Swift/SwiftUI/Combine/iOS SDK->mobile-ios,
      Kotlin(android)->mobile-android, Flutter/React Native->mobile-cross,
      Selenium/Cypress/Playwright/RestAssured/Appium->qa, .NET/ASP.NET->dotnet,
      Laravel->php, Rails->ruby. JavaScript->frontend, TypeScript->frontend.
    null for anything cross-stack: all DATASTORE/CLOUD/TOOL not stack-specific
    (PostgreSQL, Redis, Kafka, Docker, K8s, AWS, Terraform, Git), all PRACTICE,
    all SOFT, and cross-cutting LANGUAGEs (SQL, Bash).
    When unsure between a concrete stack and null, prefer null.
  "#)
  isCore bool @description(#"
    true if the skill is a *defining/primary* technology of its stack (the thing
    you'd name to identify the specialization): Go, Spring Boot, React, Swift,
    Selenium, .NET, Django, NestJS, Express.js, Kotlin, Flutter. false for
    peripheral skills, and false for every stack=null skill except a stack-neutral
    language that is itself a primary identity (SQL=false). DATASTORE/CLOUD/TOOL/
    PRACTICE/SOFT -> false.
  "#)
  generic bool @description(#"
    true if the skill is *ambient*: used by most devs regardless of stack and never
    a differentiator (Docker, Kubernetes, Git, CI/CD, Linux, SQL, REST API, Agile,
    Scrum, English, Jira, Postman, Bash, JSON, HTTP, OOP, Microservices). false for
    anything stack-specific and for specific datastores/clouds (PostgreSQL, Kafka,
    AWS are choices, not ambient). A core tech (React/Swift) must NEVER be generic.
  "#)
}

function ClassifySkills(skills: SkillToClassify[]) -> ClassifiedSkill[] {
  client OpenAIClient
  prompt #"
    You classify software skills into structural metadata used to gate reverse-ATS
    "what to learn next" recommendations for a Ukrainian dev-jobs platform. For each
    input skill emit exactly one classification. Follow each field's description
    literally; preserve count and node_id; do not drop, merge, or reorder.

    Consistency rules:
    - A LANGUAGE or FRAMEWORK with a concrete stack should usually be is_core=true.
    - DATASTORE/CLOUD/TOOL are stack=null, is_core=false; generic=true only if
      ambient (Docker, Git) — specific products (PostgreSQL, Kafka, AWS) are false.
    - PRACTICE/SOFT are stack=null, is_core=false; generic=true for ubiquitous ones
      (CI/CD, Agile, REST API, English); false for niche practices (CQRS, Event Sourcing).
    - When unsure between a concrete stack and null, prefer null (avoids false drops).

    {{ ctx.output_format }}

    Skills:
    {{ skills }}
  "#
}
