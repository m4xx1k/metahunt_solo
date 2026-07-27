export type RoadmapItem = {
  tag: string;
  title: string;
  description: string;
  status: "current" | "next";
};

export const roadmapSection = {
  tag: "> roadmap",
  title: "where we're headed.",
};

export const roadmapItems: RoadmapItem[] = [
  {
    tag: "now · foundation",
    title: "foundation",
    description: "etl from Djinni and DOU, ai parsing, golden record.",
    status: "current",
  },
  {
    tag: "next · mvp",
    title: "mvp",
    description: "public search, smart alerts in telegram, pulse of the market.",
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
    description: "market intelligence for recruiters, data-as-a-service api.",
    status: "next",
  },
  {
    tag: "global",
    title: "global",
    description:
      "LinkedIn, Glassdoor, Wellfound, Indeed. expanding into Poland and the EU.",
    status: "next",
  },
];
