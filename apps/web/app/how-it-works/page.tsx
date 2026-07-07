import type { Metadata } from "next";
import { Header } from "@/app/_components/Header";
import { Footer } from "@/app/_components/Footer";
import { HeaderAuth } from "@/features/auth/header-auth";
import { CollectSection } from "./_components/CollectSection";
import { DedupSection } from "./_components/DedupSection";
import { Hero } from "./_components/Hero";
import { MatchSection } from "./_components/MatchSection";
import { NumbersSection } from "./_components/NumbersSection";
import { ParseSection } from "./_components/ParseSection";
import { StackSection } from "./_components/StackSection";

export const metadata: Metadata = { title: "How it works · metahunt" };

export default function HowItWorksPage() {
  return (
    <>
      <Header cta={<HeaderAuth />} />
      <main className="bg-bg">
        <div className="mx-auto w-full max-w-[1080px] px-6">
          <Hero />
          <StackSection />
          <CollectSection />
          <ParseSection />
          <DedupSection />
          <MatchSection />
          <NumbersSection />
        </div>
      </main>
      <Footer />
    </>
  );
}
