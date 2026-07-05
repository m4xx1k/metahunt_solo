import type { ComponentProps } from "react";
import type { StepCard } from "./StepCard";

export type StepItem = ComponentProps<typeof StepCard>;

export const howSection = {
  tag: "> how it works",
  title: "from raw listings to the golden record.",
};

export const steps: StepItem[] = [
  {
    number: "01",
    title: "01 · aggregation",
    description:
      "we pull jobs from Djinni, DOU, and other sources every hour, 24/7.",
  },
  {
    number: "02",
    title: "02 · ai parsing",
    description:
      "an llm reads the full text and extracts the stack (must vs nice-to-have), format, salary, test task, and company type.",
  },
  {
    number: "03",
    title: "03 · golden record",
    description:
      "duplicates from different platforms merge into a single card with links back to every original source.",
  },
];
