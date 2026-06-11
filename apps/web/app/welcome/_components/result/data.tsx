import {
  SparkleIcon,
  RobotIcon,
  PlusIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { ComponentProps } from "react";
import type { RawJobCard } from "./RawJobCard";
import type { GoldenJob } from "./GoldenJobCard";

export type RawJob = ComponentProps<typeof RawJobCard>;

export const resultSection = {
  tag: "> результат",
  title: "одна вакансія — одна картка.",
  subtitle:
    "те, що на Djinni, DOU і LinkedIn виглядало як три різні оголошення, зводиться в один запис зі структурованими даними.",
};

export const rawJobs: RawJob[] = [
  { title: "Middle JavaScript Developer", source: "Djinni · $3.5k-$4k" },
  { title: "Fullstack Engineer", source: "DOU · Salary not specified" },
  { title: "Fullstack Engineer (Node.js)", source: "LinkedIn · Remote" },
];

export const goldenJob: GoldenJob = {
  meta: ["[remote / kyiv]", "•", "[full-time]"],
  match: "[match: 82%]",
  title: "fullstack engineer (middle)",
  company: "metacorp inc.",
  productTag: "[product]",
  facts: [
    [
      { label: "salary:", value: "$3.5k – $4k", highlight: true },
      { label: "test task:", value: "ні" },
    ],
    {
      label: "must-have:",
      value: "#typescript #nestjs #react #postgresql #docker #aws",
    },
    { label: "nice-to-have:", value: "#redis #kafka #kubernetes" },
  ],
  ai: { matchPercent: 82, gap: "aws, kubernetes, kafka" },
  actions: [
    {
      label: "cover letter",
      icon: <SparkleIcon weight="fill" className="h-4 w-4" />,
    },
    {
      label: "resume tailor",
      icon: <RobotIcon weight="bold" className="h-4 w-4" />,
    },
    {
      label: "в трекер",
      icon: <PlusIcon weight="bold" className="h-4 w-4" />,
    },
  ],
  appliesOn: ["djinni", "dou", "linkedin"],
};
