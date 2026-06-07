// Hardcoded sample profiles (no backend endpoint) — plain skill lists fed to
// POST /ranking/match. The "your CV" path uploads a real file instead.
export interface Sample {
  label: string;
  hint: string;
  skills: string[];
}

export const SAMPLES: Sample[] = [
  {
    label: "Python Backend",
    hint: "Django · infra",
    skills: ["Python", "Django", "FastAPI", "PostgreSQL", "Redis", "Celery", "Docker", "Kubernetes", "AWS", "RabbitMQ", "REST API", "GraphQL"],
  },
  {
    label: "React Frontend",
    hint: "UI-focused",
    skills: ["React", "TypeScript", "JavaScript", "Next.js", "Redux", "TailwindCSS", "HTML", "CSS", "GraphQL", "Jest", "Webpack", "Storybook"],
  },
  {
    label: "Full-Stack JS",
    hint: "node + react",
    skills: ["TypeScript", "React", "Next.js", "Node.js", "NestJS", "Express.js", "PostgreSQL", "Prisma", "GraphQL", "Docker", "AWS", "Redis"],
  },
  {
    label: "Data / ML",
    hint: "niche stack",
    skills: ["Python", "PyTorch", "TensorFlow", "Pandas", "NumPy", "SQL", "Spark", "Airflow", "scikit-learn", "Docker"],
  },
  {
    label: "Junior JS",
    hint: "entry-level",
    skills: ["JavaScript", "React", "HTML", "CSS", "Node.js", "Git", "TypeScript"],
  },
];
