// Realistic mock for the lab. Drawn from current production proportions
// (≈3.5k DOU + 4.6k Djinni vacancies, May 2026). The lab is a UI sandbox —
// the real wiring through aggregatesApi happens once we port this onto
// the landing page.
//
// skill.count = number of vacancies where this skill is required (must-have).

import type { FilterAggregates } from "@/components/data/vacancy-filters";

export const MOCK_AGGREGATES: FilterAggregates = {
  total: 8124,
  roles: [
    { id: "r-fe", label: "Frontend Engineer", count: 1240 },
    { id: "r-be", label: "Backend Engineer", count: 1150 },
    { id: "r-full", label: "Fullstack Engineer", count: 980 },
    { id: "r-qa", label: "QA Engineer", count: 610 },
    { id: "r-mobile", label: "Mobile Engineer", count: 520 },
    { id: "r-devops", label: "DevOps Engineer", count: 470 },
    { id: "r-data", label: "Data Engineer", count: 310 },
    { id: "r-pm", label: "Product Manager", count: 280 },
    { id: "r-design", label: "Product Designer", count: 220 },
    { id: "r-sec", label: "Security Engineer", count: 140 },
    { id: "r-ml", label: "ML Engineer", count: 190 },
  ],
  skills: [
    { id: "s-react", label: "React", count: 1820 },
    { id: "s-ts", label: "TypeScript", count: 1610 },
    { id: "s-node", label: "Node.js", count: 1120 },
    { id: "s-py", label: "Python", count: 940 },
    { id: "s-aws", label: "AWS", count: 880 },
    { id: "s-java", label: "Java", count: 720 },
    { id: "s-pg", label: "PostgreSQL", count: 720 },
    { id: "s-docker", label: "Docker", count: 690 },
    { id: "s-go", label: "Go", count: 530 },
    { id: "s-k8s", label: "Kubernetes", count: 410 },
    { id: "s-csharp", label: "C#", count: 410 },
    { id: "s-php", label: "PHP", count: 320 },
    { id: "s-rn", label: "React Native", count: 280 },
    { id: "s-mongo", label: "MongoDB", count: 240 },
    { id: "s-tw", label: "Tailwind", count: 220 },
    { id: "s-angular", label: "Angular", count: 220 },
    { id: "s-redis", label: "Redis", count: 180 },
    { id: "s-vue", label: "Vue", count: 180 },
    { id: "s-kafka", label: "Kafka", count: 180 },
    { id: "s-tf", label: "Terraform", count: 160 },
    { id: "s-graphql", label: "GraphQL", count: 140 },
    { id: "s-elastic", label: "Elasticsearch", count: 130 },
    { id: "s-rust", label: "Rust", count: 70 },
  ],
  sources: [
    { id: "src-djinni", code: "djinni", label: "Djinni", count: 4610 },
    { id: "src-dou", code: "dou", label: "DOU", count: 3514 },
  ],
  test: { yes: 1820, no: 5180, unknown: 1124 },
  reservation: { yes: 720, no: 6200, unknown: 1204 },
};
