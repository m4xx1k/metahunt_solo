import Link from "next/link";
import { Tag } from "@/components/ui-kit";
import { Lab } from "./_components/Lab";

export const metadata = {
  title: "filter widgets · lab",
};

// UI sandbox for the chosen filter design — a single sidebar with five
// sections (role / skills / source / test / reservation). Skills are
// must-have only: people search for what they need, not for what's
// optional. Sections are static on desktop and collapse into an accordion
// on mobile. State is client-only; aggregates come from a fixed mock.
// Real wiring happens once we port this onto app/(landing).

export default function FilterWidgetsLabPage() {
  return (
    <main className="flex min-h-screen flex-col bg-bg">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-baseline justify-between gap-4 px-6 py-6 md:px-12">
          <div className="flex flex-col gap-1">
            <Tag>{"// METAHUNT.LAB"}</Tag>
            <h1 className="font-display text-3xl font-bold text-text-primary md:text-4xl">
              filter widgets
            </h1>
            <p className="max-w-[70ch] font-body text-sm text-text-secondary">
              єдиний варіант для заміни віджетів секції{" "}
              <code className="font-mono text-text-primary">Snapshot</code> на головній.
              покриває{" "}
              <span className="font-mono text-text-primary">
                role · skills · source · test · reservation
              </span>
              . сайдбар на десктопі, акардеон на мобілці. скіли — лише{" "}
              <span className="text-accent">must-have</span> з пошуком.
            </p>
          </div>
          <Link
            href="/"
            className="font-mono text-xs uppercase tracking-wider text-text-secondary hover:text-accent"
          >
            ← back to /
          </Link>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1280px] px-6 py-12 md:px-12">
        <Lab />
      </div>
    </main>
  );
}
