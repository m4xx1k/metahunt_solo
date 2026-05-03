import { Header } from "@/components/sections/Header";
import { Hero } from "@/components/sections/Hero";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { Problem } from "@/components/sections/Problem";
import { Result } from "@/components/sections/Result";
import { AboutMe } from "@/components/sections/AboutMe";
import { AiCopilot } from "@/components/sections/AiCopilot";
import { Roadmap } from "@/components/sections/Roadmap";
import { FinalCTA } from "@/components/sections/FinalCTA";
import { Footer } from "@/components/sections/Footer";

export default function Home() {
  return (
    <>
      <Header />
      <Hero />
      <Problem />
      <HowItWorks />
      <Result />
      <AiCopilot />
      <Roadmap />
      {/* <Audience /> */}
      <AboutMe />
      <FinalCTA />
      <Footer />
    </>
  );
}
