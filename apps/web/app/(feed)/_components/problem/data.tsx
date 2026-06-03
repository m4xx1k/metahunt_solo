import {
  StackIcon,
  FunnelIcon,
  HourglassIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { ComponentProps } from "react";
import type { ProblemCard } from "./ProblemCard";

export type ProblemItem = ComponentProps<typeof ProblemCard>;

export const problemSection = {
  tag: "> проблема",
  title: "пошук роботи зламано.",
  subtitle:
    "10 вкладок щоранку, фільтри з неточними даними, кавер-летери вручну. знайомо?",
};

export const problems: ProblemItem[] = [
  {
    icon: <StackIcon weight="bold" className="h-6 w-6" />,
    title: "розкиданий ринок",
    description:
      "вакансії живуть на 10+ платформах, та сама позиція дублюється одночасно на трьох. побачити ринок цілим неможливо.",
  },
  {
    icon: <FunnelIcon weight="bold" className="h-6 w-6" />,
    title: "дані без стандарту",
    description:
      "remote означає офіс, must-have стек схований у середині опису, тестове ніяк не позначене. формальні фільтри не працюють.",
  },
  {
    icon: <HourglassIcon weight="bold" className="h-6 w-6" />,
    title: "пошук як друга робота",
    description:
      "кавер-летер під кожну вакансію, адаптація резюме, таблички в notion для трекінгу — усе вручну, без жодного ai.",
  },
];
