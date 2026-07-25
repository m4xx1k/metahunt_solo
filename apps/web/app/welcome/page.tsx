import type { Metadata } from "next";

import { Header, type NavItem } from "@/app/_components/Header";
import { Footer } from "@/app/_components/Footer";
import { pageMetadata } from "@/lib/seo/metadata";
import { Hero } from "./_components/hero/Hero";
import { Problem } from "./_components/problem/Problem";
import { HowItWorks } from "./_components/how/HowItWorks";
import { Result } from "./_components/result/Result";
import { AiCopilot } from "./_components/ai/AiCopilot";
import { Roadmap } from "./_components/roadmap/Roadmap";
import { AboutMe } from "./_components/about/AboutMe";
import { FinalCTA } from "./_components/cta/FinalCTA";

const welcomeNav: NavItem[] = [
  { label: "problem", href: "#problem" },
  { label: "solution", href: "#how" },
  { label: "result", href: "#result" },
  { label: "features", href: "#ai" },
  { label: "roadmap", href: "#roadmap" },
  { label: "about", href: "#about" },
  { label: "jobs", href: "/" },
  { label: "monitoring", href: "/dashboard" },
];

// A second pitch for the same product on a second URL: indexed, it competed with
// the feed for the brand query. Stays live and followable as an ad landing page,
// but out of the index. Deliberately self-canonical — pointing the canonical at
// `/` while also sending noindex risks Google applying the noindex to `/` too.
export const metadata: Metadata = pageMetadata({
  title: "Про проєкт",
  description:
    "Чому metahunt існує: дублі між DOU і Djinni, неструктуровані описи, і скільки часу з'їдає ручний пошук вакансій.",
  path: "/welcome",
  noindex: true,
});

export default function WelcomePage() {
  return (
    <>
      <Header links={welcomeNav} />
      <Hero />
      <Problem />
      <HowItWorks />
      <Result />
      <AiCopilot />
      <Roadmap />
      <AboutMe />
      <FinalCTA />
      <Footer />
    </>
  );
}
