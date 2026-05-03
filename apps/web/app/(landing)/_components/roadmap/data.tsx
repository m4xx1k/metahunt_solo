export type RoadmapItem = {
  tag: string;
  title: string;
  description: string;
  status: "current" | "next";
};

export const roadmapSection = {
  tag: "> roadmap",
  title: "куди рухаємось.",
};

export const roadmapItems: RoadmapItem[] = [
  {
    tag: "now · foundation",
    title: "foundation",
    description: "etl з Djinni та DOU, ai-парсинг, golden record.",
    status: "current",
  },
  {
    tag: "next · mvp",
    title: "mvp",
    description: "публічний пошук, smart alerts у telegram, pulse of the market.",
    status: "next",
  },
  {
    tag: "ai + tracker",
    title: "ai + tracker",
    description:
      "gap analysis, cover letter, resume adaptation, application tracker.",
    status: "next",
  },
  {
    tag: "b2b",
    title: "b2b",
    description: "market intelligence для рекрутерів, data-as-a-service api.",
    status: "next",
  },
  {
    tag: "global",
    title: "global",
    description:
      "LinkedIn, Glassdoor, Wellfound, Indeed. вихід на ринки Польщі та ЄС.",
    status: "next",
  },
];
