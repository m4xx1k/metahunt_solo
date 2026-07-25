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
import { pageMetadata } from "@/lib/seo/metadata";

// Copy on this page is still English, so its title stays English too — a
// Ukrainian title over an English body is a worse signal than either alone.
export const metadata: Metadata = pageMetadata({
  title: "How it works",
  description:
    "How metahunt collects Ukrainian tech jobs from DOU and Djinni, structures them with AI, collapses reposts of the same role, and ranks them against your CV.",
  path: "/how-it-works",
});

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
