import { createHash } from "node:crypto";

import { eq, sql } from "drizzle-orm";

import { candidates, candidateNodes } from "../src/schema";
import type { DrizzleDB } from "../src/tokens";

// Seed the reverse-ATS demo profiles as real `sample` candidate rows, so the
// picker ranks them through the SAME /cv/:id/matches path as an uploaded CV (no
// hardcoded skill list in the frontend, no special sample fetch branch). Skills
// resolve to existing SKILL nodes — run AFTER seedNodes. Idempotent on
// contentHash. Presentation (label/hint) rides `extracted.sample`.

type Seniority = "INTERN" | "JUNIOR" | "MIDDLE" | "SENIOR" | "LEAD" | "PRINCIPAL" | "C_LEVEL";
type EnglishLevel = "BEGINNER" | "INTERMEDIATE" | "UPPER_INTERMEDIATE" | "ADVANCED" | "NATIVE";

interface SampleSeed {
  label: string;
  hint: string;
  role: string;
  seniority: Seniority;
  englishLevel: EnglishLevel;
  experienceYears: number;
  skills: string[];
}

const SAMPLES: SampleSeed[] = [
  {
    label: "Python Backend",
    hint: "Django · infra",
    role: "Backend Developer",
    seniority: "MIDDLE",
    englishLevel: "UPPER_INTERMEDIATE",
    experienceYears: 4,
    skills: [
      "Python",
      "Django",
      "FastAPI",
      "PostgreSQL",
      "Redis",
      "Celery",
      "Docker",
      "Kubernetes",
      "AWS",
      "RabbitMQ",
      "REST API",
      "GraphQL",
    ],
  },
  {
    label: "React Frontend",
    hint: "UI-focused",
    role: "Frontend Developer",
    seniority: "MIDDLE",
    englishLevel: "UPPER_INTERMEDIATE",
    experienceYears: 3,
    skills: [
      "React",
      "TypeScript",
      "JavaScript",
      "Next.js",
      "Redux",
      "TailwindCSS",
      "HTML",
      "CSS",
      "GraphQL",
      "Jest",
      "Webpack",
      "Storybook",
    ],
  },
  {
    label: "Full-Stack JS",
    hint: "node + react",
    role: "Fullstack Developer",
    seniority: "SENIOR",
    englishLevel: "ADVANCED",
    experienceYears: 5,
    skills: [
      "TypeScript",
      "React",
      "Next.js",
      "Node.js",
      "NestJS",
      "Express.js",
      "PostgreSQL",
      "Prisma",
      "GraphQL",
      "Docker",
      "AWS",
      "Redis",
    ],
  },
  {
    label: "Data / ML",
    hint: "niche stack",
    role: "Data Scientist",
    seniority: "MIDDLE",
    englishLevel: "UPPER_INTERMEDIATE",
    experienceYears: 3,
    skills: [
      "Python",
      "PyTorch",
      "TensorFlow",
      "Pandas",
      "NumPy",
      "SQL",
      "Spark",
      "Airflow",
      "scikit-learn",
      "Docker",
    ],
  },
  {
    label: "Junior JS",
    hint: "entry-level",
    role: "Frontend Developer",
    seniority: "JUNIOR",
    englishLevel: "INTERMEDIATE",
    experienceYears: 1,
    skills: ["JavaScript", "React", "HTML", "CSS", "Node.js", "Git", "TypeScript"],
  },
];

// Stable synthetic CV text → stable contentHash (re-seed is idempotent, never
// re-hits any extractor: samples skip the LLM path entirely).
function sampleText(s: SampleSeed): string {
  return [
    `Sample profile: ${s.label}`,
    `Role: ${s.role}`,
    `Seniority: ${s.seniority}`,
    `Experience: ${s.experienceYears} years`,
    `English: ${s.englishLevel}`,
    `Skills: ${s.skills.join(", ")}`,
  ].join("\n");
}

// Resolve skill names → SKILL node ids via canonical + alias (canonical wins),
// mirroring RankingService.resolveSkills. Unresolved names are kept (like a real
// CV's unmatched skills) but simply don't link a node.
export async function resolveSkillIds(
  db: DrizzleDB,
  names: string[],
): Promise<{ ids: string[]; unmatched: string[] }> {
  const cleaned = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (cleaned.length === 0) return { ids: [], unmatched: [] };
  const lowered = cleaned.map((s) => s.toLowerCase());
  const inList = sql.join(
    lowered.map((s) => sql`${s}`),
    sql`, `,
  );
  const res = await db.execute<{ key: string; id: string; via: string }>(sql`
    SELECT lower(n.canonical_name) AS key, n.id::text AS id, 'canonical' AS via
    FROM nodes n
    WHERE n.type = 'SKILL' AND n.status <> 'HIDDEN'
      AND lower(n.canonical_name) IN (${inList})
    UNION ALL
    SELECT lower(a.name) AS key, n.id::text AS id, 'alias' AS via
    FROM node_aliases a
    JOIN nodes n ON n.id = a.node_id
    WHERE a.type = 'SKILL' AND n.status <> 'HIDDEN'
      AND lower(a.name) IN (${inList})
  `);
  const byKey = new Map<string, string>();
  for (const r of res.rows) if (r.via === "canonical") byKey.set(r.key, r.id);
  for (const r of res.rows) if (r.via === "alias" && !byKey.has(r.key)) byKey.set(r.key, r.id);

  const ids = new Set<string>();
  const unmatched: string[] = [];
  cleaned.forEach((raw, i) => {
    const id = byKey.get(lowered[i]);
    if (id) ids.add(id);
    else unmatched.push(raw);
  });
  return { ids: [...ids], unmatched };
}

export async function seedSampleCandidates(db: DrizzleDB): Promise<void> {
  for (const s of SAMPLES) {
    const sourceText = sampleText(s);
    const contentHash = createHash("sha256")
      .update(sourceText.replace(/\s+/g, " ").toLowerCase())
      .digest("hex");
    const { ids, unmatched } = await resolveSkillIds(db, s.skills);

    const extracted = {
      role: s.role,
      seniority: s.seniority,
      skills: { required: s.skills, optional: [] as string[] },
      experienceYears: s.experienceYears,
      englishLevel: s.englishLevel,
      unmatchedSkills: unmatched,
      sample: { label: s.label, hint: s.hint },
    };
    const row = {
      contentHash,
      sourceText,
      extracted,
      type: "sample" as const,
      role: s.role,
      seniority: s.seniority,
      englishLevel: s.englishLevel,
      experienceYears: s.experienceYears,
    };

    const [{ id: candidateId }] = await db
      .insert(candidates)
      .values(row)
      .onConflictDoUpdate({
        target: candidates.contentHash,
        set: {
          extracted,
          type: "sample",
          role: s.role,
          seniority: s.seniority,
          englishLevel: s.englishLevel,
          experienceYears: s.experienceYears,
        },
      })
      .returning({ id: candidates.id });

    // Re-sync skill links from scratch (a changed sample skill list stays exact).
    await db.delete(candidateNodes).where(eq(candidateNodes.candidateId, candidateId));
    if (ids.length > 0) {
      await db
        .insert(candidateNodes)
        .values(ids.map((nodeId) => ({ candidateId, nodeId })))
        .onConflictDoNothing();
    }
  }
}
