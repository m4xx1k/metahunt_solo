import { Header, type NavItem } from "@/components/shared/Header";
import { Footer } from "@/components/shared/Footer";
import { Hero } from "./_components/hero/Hero";
import { Problem } from "./_components/problem/Problem";
import { HowItWorks } from "./_components/how/HowItWorks";
import { Result } from "./_components/result/Result";
import { AiCopilot } from "./_components/ai/AiCopilot";
import { Roadmap } from "./_components/roadmap/Roadmap";
import { AboutMe } from "./_components/about/AboutMe";
import { FinalCTA } from "./_components/cta/FinalCTA";

const landingNav: NavItem[] = [
  { label: "проблема", href: "#problem" },
  { label: "рішення", href: "#how" },
  { label: "результат", href: "#result" },
  { label: "фічі", href: "#ai" },
  { label: "роадмапа", href: "#roadmap" },
  { label: "хто я", href: "#about" },
  { label: "моніторинг", href: "/dashboard" },
];

export default function LandingPage() {
  return (
    <>
      <Header links={landingNav} />
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
