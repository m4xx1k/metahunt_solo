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
  tag: "> можливості",
  title: "все що потрібно для пошуку.",
  subtitle:
    "ai-асистент, розумні алерти, трекер відгуків і аналітика ринку — в одному місці.",
};

export const aiFeatures: FeatureItem[] = [
  {
    icon: <GitMergeIcon weight="bold" className="h-7 w-7" />,
    title: "gap analysis",
    description:
      "порівнюємо твоє резюме з текстом вакансії й показуємо покриття у відсотках плюс те, чого саме бракує.",
  },
  {
    icon: <FileTextIcon weight="bold" className="h-7 w-7" />,
    title: "cover letter + cv",
    description:
      "генеруємо персоналізований лист і адаптуємо резюме під лексику вакансії на основі реальних збігів досвіду.",
  },
  {
    icon: <BellIcon weight="bold" className="h-7 w-7" />,
    title: "smart alerts у telegram",
    description:
      "підписка на точну комбінацію фільтрів (react обов'язковий, без тестового, не аутстаф, від $3k). пуш одразу, як з'являється збіг.",
  },
  {
    icon: <ListChecksIcon weight="bold" className="h-7 w-7" />,
    title: "application tracker",
    description:
      "усі твої відгуки в одній воронці зі статусами, дедлайнами й нагадуваннями. без паралельних табличок у notion.",
  },
  {
    icon: <TrendUpIcon weight="bold" className="h-7 w-7" />,
    title: "динаміка попиту",
    description:
      "які стеки ростуть, які падають, скільки нових вакансій з'явилося сьогодні. node.js vs python, react vs vue — в цифрах.",
  },
];
