import Link from "next/link";

import type { VacancyAggregates } from "@/lib/api/aggregates";
import { Divider } from "@/ui";
import { TotalCounter } from "./TotalCounter";

// Intro / hero for the feed. One cohesive block (no separate background band):
// the headline + live counter say *what this is*. The market picker lives
// between this intro and the feed, where it can update without crowding hero.

type Props = {
  aggregates: VacancyAggregates;
  /** Track pages replace the index headline so each one has an h1 of its own. */
  heading?: { title: React.ReactNode; subtitle: string };
};

export function FeedHero({ aggregates: a, heading }: Props) {
  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-6 pt-16 pb-10 md:px-12">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[3fr_2fr] md:items-stretch">
        <div className="flex flex-col justify-center gap-5">
          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-text-primary md:text-5xl">
            {heading?.title ?? (
              <>
                Пошук роботи в IT — <span className="text-accent">в одному місці</span>.
              </>
            )}
          </h1>
          <p className="max-w-[560px] font-body text-base leading-[1.55] text-text-secondary md:text-lg">
            {heading?.subtitle ?? "Нові вакансії з DOU і Djinni, зібрані без повторів."}
          </p>
          <Link
            href="/how-it-works"
            className="w-fit font-mono text-xs uppercase tracking-wider text-text-muted underline-offset-4 transition-colors hover:text-accent hover:underline"
          >
            &gt; як це працює
          </Link>
        </div>
        <TotalCounter total={a.total} lastSyncAt={a.lastSyncAt} sources={a.sources} />
      </div>
      <Divider className="mt-2" />
    </section>
  );
}
