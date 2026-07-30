import Link from "next/link";

import { Footer } from "@/app/_components/Footer";
import { Header } from "@/app/_components/Header";
import { VacancyCard } from "@/entities/vacancy/VacancyCard";
import type { VacancyDto } from "@/lib/api/vacancies";
import { Tag } from "@/ui";

type Props = {
  eyebrow: string;
  heading: string;
  intro: string;
  vacancies: VacancyDto[];
  /** Where "see everything" goes — the feed, pre-filtered. */
  browseHref: string;
  browseLabel: string;
  /** Rendered under the list: sibling hubs, so these pages link to each other. */
  related?: { label: string; href: string }[];
};

// Shared by the role and company landings. One shell instead of two near-identical
// pages — the repo's rule is composition, not a second copy.
export function HubShell({
  eyebrow,
  heading,
  intro,
  vacancies,
  browseHref,
  browseLabel,
  related = [],
}: Props) {
  return (
    <>
      <Header links={[{ label: "усі вакансії", href: "/" }]} cta={null} />
      <main className="page-dot-grid bg-bg">
        <section className="border-b border-border px-6 py-16 md:px-12 md:py-20">
          <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-5">
            <Tag>&gt; {eyebrow}</Tag>
            <h1 className="font-display text-3xl font-black leading-tight tracking-tight text-text-primary md:text-5xl">
              {heading}
            </h1>
            <p className="max-w-[760px] font-body text-base leading-[1.6] text-text-secondary md:text-lg">
              {intro}
            </p>
            <Link
              href={browseHref}
              className="w-fit border border-border-strong px-4 py-2.5 font-mono text-xs uppercase tracking-wider text-text-secondary transition-colors hover:border-accent hover:text-accent"
            >
              {browseLabel} →
            </Link>
          </div>
        </section>

        <section className="px-6 py-12 md:px-12">
          <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6">
            {vacancies.map((vacancy) => (
              <VacancyCard key={vacancy.id} vacancy={vacancy} />
            ))}

            {related.length > 0 ? (
              <div className="flex flex-col gap-3 border-t border-border pt-8">
                <Tag>&gt; схожі напрями</Tag>
                <div className="flex flex-wrap gap-2">
                  {related.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="border border-border bg-bg-card px-3 py-1.5 font-mono text-xs text-text-secondary transition-colors hover:border-accent hover:text-accent"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
