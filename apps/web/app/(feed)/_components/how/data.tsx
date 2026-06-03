import type { ComponentProps } from "react";
import type { StepCard } from "./StepCard";

export type StepItem = ComponentProps<typeof StepCard>;

export const howSection = {
  tag: "> як це працює",
  title: "від сирих оголошень до золотої картки.",
};

export const steps: StepItem[] = [
  {
    number: "01",
    title: "01 · агрегація",
    description:
      "збираємо вакансії з Djinni, DOU та інших джерел щогодини, 24/7.",
  },
  {
    number: "02",
    title: "02 · ai-парсинг",
    description:
      "llm читає повний текст і витягує стек (must vs nice-to-have), формат, зарплату, тестове, тип компанії.",
  },
  {
    number: "03",
    title: "03 · golden record",
    description:
      "дублікати з різних платформ зливаються в одну картку з посиланнями на всі першоджерела.",
  },
];
