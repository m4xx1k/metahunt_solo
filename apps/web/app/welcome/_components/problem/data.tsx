import {
  StackIcon,
  FunnelIcon,
  HourglassIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { ComponentProps } from "react";
import type { ProblemCard } from "./ProblemCard";

export type ProblemItem = ComponentProps<typeof ProblemCard>;

export const problemSection = {
  tag: "> problem",
  title: "job hunting is broken.",
  subtitle:
    "10 tabs every morning, filters running on stale data, cover letters written by hand. sound familiar?",
};

export const problems: ProblemItem[] = [
  {
    icon: <StackIcon weight="bold" className="h-6 w-6" />,
    title: "a scattered market",
    description:
      "jobs live across 10+ platforms, and the same posting gets duplicated on three of them at once. seeing the whole market is impossible.",
  },
  {
    icon: <FunnelIcon weight="bold" className="h-6 w-6" />,
    title: "data with no standard",
    description:
      "\"remote\" means office, the must-have stack is buried mid-description, test tasks go unmarked. formal filters just don't work.",
  },
  {
    icon: <HourglassIcon weight="bold" className="h-6 w-6" />,
    title: "job hunting as a second job",
    description:
      "a cover letter for every posting, resume tweaks, spreadsheets in notion for tracking — all by hand, with zero ai.",
  },
];
