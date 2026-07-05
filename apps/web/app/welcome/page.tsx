import { Header, type NavItem } from "@/app/_components/Header";
import { Footer } from "@/app/_components/Footer";
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
