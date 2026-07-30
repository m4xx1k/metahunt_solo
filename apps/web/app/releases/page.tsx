import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Metadata } from "next";
import Link from "next/link";

import { Footer } from "@/app/_components/Footer";
import { Header } from "@/app/_components/Header";
import { parseReleases, type ReleaseDay } from "@/lib/releases";
import { pageMetadata } from "@/lib/seo/metadata";
import { Tag } from "@/ui";

// Generated from the engineering journal at build time, so there is no second
// place releases are written and nothing to keep in sync. Fully static: the
// content only changes when a deploy changes the file.
export const dynamic = "force-static";

const JOURNAL = "md/journal/releases.md";

export const metadata: Metadata = pageMetadata({
  title: "Що нового",
  description:
    "Журнал змін metahunt: що додано і виправлено, від найновішого. Кожен запис розкривається до інженерних деталей.",
  path: "/releases",
});

async function loadReleases(): Promise<ReleaseDay[]> {
  // Vercel builds with cwd = apps/web; the journal lives at the monorepo root.
  const file = path.join(process.cwd(), "..", "..", JOURNAL);
  // A missing journal shouldn't fail the build — the page just renders empty.
  const markdown = await readFile(file, "utf8").catch(() => "");
  return parseReleases(markdown);
}

const MONTHS = [
  "січня",
  "лютого",
  "березня",
  "квітня",
  "травня",
  "червня",
  "липня",
  "серпня",
  "вересня",
  "жовтня",
  "листопада",
  "грудня",
];

function formatDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export default async function ReleasesPage() {
  const days = await loadReleases();
  const total = days.reduce((n, day) => n + day.entries.length, 0);

  return (
    <>
      <Header links={[{ label: "усі вакансії", href: "/" }]} cta={null} />
      <main className="page-dot-grid bg-bg">
        <section className="border-b border-border px-6 py-16 md:px-12 md:py-20">
          <div className="mx-auto flex w-full max-w-[880px] flex-col gap-5">
            <Tag>&gt; журнал змін</Tag>
            <h1 className="font-display text-3xl font-black leading-tight tracking-tight text-text-primary md:text-5xl">
              Що нового
            </h1>
            <p className="max-w-[680px] font-body text-base leading-[1.6] text-text-secondary md:text-lg">
              {total > 0
                ? `${total} записів, від найновішого. Це той самий журнал, який ведеться в репозиторії — розкрий запис, якщо хочеш інженерні деталі.`
                : "Журнал поки порожній."}
            </p>
          </div>
        </section>

        <section className="px-6 py-12 md:px-12">
          <div className="mx-auto flex w-full max-w-[880px] flex-col gap-12">
            {days.map((day) => (
              <div key={`${day.date}${day.note ?? ""}`} className="flex flex-col gap-4">
                <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
                  {formatDay(day.date)}
                  {day.note ? <span className="text-text-muted"> {day.note}</span> : null}
                </h2>
                <ul className="flex flex-col gap-3">
                  {day.entries.map((entry, i) => (
                    <li key={i} className="border border-border bg-bg-card">
                      {entry.body ? (
                        <details className="group">
                          <summary className="flex cursor-pointer items-start gap-3 p-4 font-mono text-sm font-bold text-text-primary transition-colors hover:text-accent">
                            <span
                              aria-hidden
                              className="mt-0.5 shrink-0 text-accent transition-transform group-open:rotate-90"
                            >
                              ▸
                            </span>
                            <span dangerouslySetInnerHTML={{ __html: entry.title }} />
                          </summary>
                          <div
                            className="release-body border-t border-border px-4 py-4 pl-10 text-sm leading-relaxed text-text-secondary"
                            dangerouslySetInnerHTML={{ __html: entry.body }}
                          />
                        </details>
                      ) : (
                        <p
                          className="release-body p-4 pl-10 font-mono text-sm font-bold text-text-primary"
                          dangerouslySetInnerHTML={{ __html: entry.title }}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <div className="border-t border-border pt-6">
              <Link
                href="/"
                className="font-mono text-xs uppercase tracking-wider text-text-muted transition-colors hover:text-accent"
              >
                ← усі вакансії
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
