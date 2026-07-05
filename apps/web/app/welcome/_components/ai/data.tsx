import {
  GitMergeIcon,
  FileTextIcon,
  BellIcon,
  ListChecksIcon,
  TrendUpIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { ComponentProps } from "react";
import type { FeatureCard } from "./FeatureCard";

export type FeatureItem = ComponentProps<typeof FeatureCard>;

export const aiCopilotSection = {
  tag: "> features",
  title: "everything you need for the job search.",
  subtitle:
    "ai assistant, smart alerts, application tracker, and market analytics — all in one place.",
};

export const aiFeatures: FeatureItem[] = [
  {
    icon: <GitMergeIcon weight="bold" className="h-7 w-7" />,
    title: "gap analysis",
    description:
      "we compare your resume against the job description and show your coverage as a percentage, plus exactly what's missing.",
  },
  {
    icon: <FileTextIcon weight="bold" className="h-7 w-7" />,
    title: "cover letter + cv",
    description:
      "we generate a personalized cover letter and tailor your resume to the job's language, based on real matches with your experience.",
  },
  {
    icon: <BellIcon weight="bold" className="h-7 w-7" />,
    title: "smart alerts in telegram",
    description:
      "subscribe to the exact filter combo you want (react required, no test task, not staff augmentation, from $3k). get a push the moment a match appears.",
  },
  {
    icon: <ListChecksIcon weight="bold" className="h-7 w-7" />,
    title: "application tracker",
    description:
      "all your applications in one pipeline with statuses, deadlines, and reminders. no more parallel spreadsheets in notion.",
  },
  {
    icon: <TrendUpIcon weight="bold" className="h-7 w-7" />,
    title: "demand trends",
    description:
      "which stacks are rising, which are falling, how many new jobs appeared today. node.js vs python, react vs vue — in numbers.",
  },
];
