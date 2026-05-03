import type { ComponentProps } from "react";
import {
  StackIcon,
  FunnelIcon,
  HourglassIcon,
  SparkleIcon,
  RobotIcon,
  PlusIcon,
  GitMergeIcon,
  FileTextIcon,
  BellIcon,
  ListChecksIcon,
  TrendUpIcon,
  UserIcon,
} from "@phosphor-icons/react/dist/ssr";
import type {
  GoldenJob,
  ProblemCard,
  RawJobCard,
  StepCard,
  FeatureCard,
} from "@/components/ui-kit";

export type NavItem = { label: string; href: string };
export type ProblemItem = ComponentProps<typeof ProblemCard>;
export type StepItem = ComponentProps<typeof StepCard>;
export type RawJob = ComponentProps<typeof RawJobCard>;
export type FeatureItem = ComponentProps<typeof FeatureCard>;

const iconClass = "h-6 w-6";
const featureIconClass = "h-7 w-7";

export const navLinks: NavItem[] = [
  { label: "проблема", href: "#problem" },
  { label: "рішення", href: "#how" },
  { label: "результат", href: "#result" },
  { label: "фічі", href: "#ai" },
  { label: "роадмапа", href: "#roadmap" },
  { label: "хто я", href: "#about" },
  { label: "моніторинг", href: "/monitoring" },
];

export const hero = {
  title: "ВЕСЬ IT-РИНОК. ОДНА ВКЛАДКА.",
  subtitle:
    "агрегатор і ai-асистент: збираємо вакансії з усіх джерел, чистимо від дублікатів і допомагаємо подати заявку за хвилини.",
  cta: "Отримати ранній доступ",
  microCopy: "без спаму. тільки коли буде готово.",
};

export const problemSection = {
  tag: "> проблема",
  title: "пошук роботи зламано.",
  subtitle:
    "10 вкладок щоранку, фільтри з неточними даними, кавер-летери вручну. знайомо?",
};

export const problems: ProblemItem[] = [
  {
    icon: <StackIcon weight="bold" className={iconClass} />,
    title: "розкиданий ринок",
    description:
      "вакансії живуть на 10+ платформах, та сама позиція дублюється одночасно на трьох. побачити ринок цілим неможливо.",
  },
  {
    icon: <FunnelIcon weight="bold" className={iconClass} />,
    title: "дані без стандарту",
    description:
      "remote означає офіс, must-have стек схований у середині опису, тестове ніяк не позначене. формальні фільтри не працюють.",
  },
  {
    icon: <HourglassIcon weight="bold" className={iconClass} />,
    title: "пошук як друга робота",
    description:
      "кавер-летер під кожну вакансію, адаптація резюме, таблички в notion для трекінгу — усе вручну, без жодного ai.",
  },
];

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

export const resultSection = {
  tag: "> результат",
  title: "одна вакансія — одна картка.",
  subtitle:
    "те, що на Djinni, DOU і LinkedIn виглядало як три різні оголошення, зводиться в один запис зі структурованими даними.",
};

export const aboutMeSection = {
  tag: "// about.me",
  title: "хто будує metahunt.",
  subtitle:
    "",
  terminalTitle: "maxxik@metahunt: ~/about",
  buildInPublicTitle: "build in public on:",
  socials: ["telegram", "instagram", "tiktok", "threads"],
  socialData: [
    {
      name: "telegram",
      link: "https://t.me/maxxikAI",
      bg: "24A1DE"
    },
    {
      name: "instagram",
      link: "https://www.instagram.com/maxchill69/",
      bg: "E1306C"
    },
    {
      name: "tiktok",
      link: "https://www.tiktok.com/@maxxik.ai",
      bg: "FE2C55"
    },
    {
      name: "youtube",
      link: "https://www.youtube.com/@maxxikAI",
      bg: "FF0000"
    }
  ],
  streamNote:
    "стрімлю, як будую metahunt: фічі, експерименти, факапи і прогрес у реальному часі.",
  profile: [
    "name: макс (mAxxIk)",
    "role: founder & lead developer of metahunt",
    "location: львів, україна",
    "focus: rag, ai-агенти, fullstack architecture",
  ],
  story:
    "за 3 роки пройшов шлях від фрілансу в 18 років через різні проєкти до mid+ fullstack у ai-стартапі. \nзараз на 4 курсі політеху і будую власні продукти solo.",
  achievements: [
    "[2026-04] 3 місце на ai hackathon mono x skelar",
    "[gaming] апнув мортіса на 2 прайм в brawl stars",
    "[build] metahunt як core-проєкт: ai-агрегатор вакансій",
    "[mindset] раціональність · ентузіазм · швидкість",
    
  ],
};

export const rawJobs: RawJob[] = [
  { title: "Middle JavaScript Developer", source: "Djinni · $3.5k-$4k" },
  { title: "Fullstack Engineer", source: "DOU · Salary not specified" },
  { title: "Fullstack Engineer (Node.js)", source: "LinkedIn · Remote" },
];

const actionIconClass = "h-4 w-4";

export const goldenJob: GoldenJob = {
  meta: ["[remote / kyiv]", "•", "[full-time]"],
  match: "[match: 82%]",
  title: "fullstack engineer (middle)",
  company: "metacorp inc.",
  productTag: "[product]",
  facts: [
    [{
      label: "salary:",
      value: "$3.5k – $4k",
      highlight: true,
    },{ label: "test task:", value: "ні" },],
    { label: "must-have:", value: "#typescript #nestjs #react #postgresql #docker #aws" },
    { label: "nice-to-have:", value: "#redis #kafka #kubernetes" },
    
  ],
  ai: { matchPercent: 82, gap: "aws, kubernetes, kafka" },
  actions: [
    {
      label: "cover letter",
      icon: <SparkleIcon weight="fill" className={actionIconClass} />,
    },
    {
      label: "resume tailor",
      icon: <RobotIcon weight="bold" className={actionIconClass} />,
    },
    {
      label: "в трекер",
      icon: <PlusIcon weight="bold" className={actionIconClass} />,
    },
  ],
  appliesOn: ["djinni", "dou", "linkedin"],
};

export const aiCopilotSection = {
  tag: "> можливості",
  title: "все що потрібно для пошуку.",
  subtitle:
    "ai-асистент, розумні алерти, трекер відгуків і аналітика ринку — в одному місці.",
};

export const aiFeatures: FeatureItem[] = [
  {
    icon: <GitMergeIcon weight="bold" className={featureIconClass} />,
    title: "gap analysis",
    description:
      "порівнюємо твоє резюме з текстом вакансії й показуємо покриття у відсотках плюс те, чого саме бракує.",
  },
  {
    icon: <FileTextIcon weight="bold" className={featureIconClass} />,
    title: "cover letter + cv",
    description:
      "генеруємо персоналізований лист і адаптуємо резюме під лексику вакансії на основі реальних збігів досвіду.",
  },
  {
    icon: <BellIcon weight="bold" className={featureIconClass} />,
    title: "smart alerts у telegram",
    description:
      "підписка на точну комбінацію фільтрів (react обов'язковий, без тестового, не аутстаф, від $3k). пуш одразу, як з'являється збіг.",
  },
  {
    icon: <ListChecksIcon weight="bold" className={featureIconClass} />,
    title: "application tracker",
    description:
      "усі твої відгуки в одній воронці зі статусами, дедлайнами й нагадуваннями. без паралельних табличок у notion.",
  },
  {
    icon: <TrendUpIcon weight="bold" className={featureIconClass} />,
    title: "динаміка попиту",
    description:
      "які стеки ростуть, які падають, скільки нових вакансій з'явилося сьогодні. node.js vs python, react vs vue — в цифрах.",
  },
];

export const roadmapSection = {
  tag: "> roadmap",
  title: "куди рухаємось.",
};

export type RoadmapItem = {
  tag: string;
  title: string;
  description: string;
  status: "current" | "next";
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
    description: "gap analysis, cover letter, resume adaptation, application tracker.",
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
    description: "LinkedIn, Glassdoor, Wellfound, Indeed. вихід на ринки Польщі та ЄС.",
    status: "next",
  },
];

export const audienceSection = {
  tag: "> для кого",
  title: "зроблено для тих, хто шукає сам.",
  card: {
    icon: <UserIcon weight="bold" className={iconClass} />,
    title: "Для кандидатів",
    description: "mid і senior інженери, які втомилися перемикатися між джоб-бордами, клеїти кавер-летери й вести воронку в excel. metahunt — це одне вікно замість десяти вкладок і ручної рутини.",
    bullets: [
      "усі джерела в одній стрічці — без дублікатів.",
      "фільтри по реальному стеку, формату й тестовому — а не по тому, що заповнив рекрутер.",
      "ai пише лист і адаптує резюме за хвилини.",
      "трекер усіх відгуків — у тому ж вікні, де ти їх знайшов.",
    ],
  },
};

export const ctaSection = {
  tag: "// waitlist",
  title: "не шукай як у 2015-му.",
  subtitle: "перші 200 користувачів отримають premium безкоштовно на рік.",
  cta: "Отримати ранній доступ",
  placeholder: "your@email.com",
};
