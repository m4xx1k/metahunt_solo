import type { Metadata } from "next";

import { Footer } from "@/app/_components/Footer";
import { Header } from "@/app/_components/Header";
import { HeaderAuth } from "@/features/auth/header-auth";

import { TailorWorkbench } from "./_components/TailorWorkbench";

export const metadata: Metadata = {
  title: "Tailor your CV · metahunt",
  description:
    "Tailor your CV to any job — select, reorder, and reword only what you already proved. Every change is checked so nothing is invented.",
};

// Client-driven (reads ?cv= via useSearchParams, fetches per session) — no
// static prerender.
export const dynamic = "force-dynamic";

export default function CvTailorPage() {
  return (
    <>
      <Header cta={<HeaderAuth />} />
      <main className="bg-bg">
        <div className="mx-auto w-full max-w-[1180px] px-6 py-10">
          <TailorWorkbench />
        </div>
      </main>
      <Footer />
    </>
  );
}
