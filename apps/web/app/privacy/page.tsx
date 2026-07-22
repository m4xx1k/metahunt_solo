import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";

import { Footer } from "@/app/_components/Footer";
import { Header } from "@/app/_components/Header";
import { Card, Tag } from "@/ui";

const SITE_URL = "https://www.metahunt.app";

export const metadata: Metadata = {
  title: "Privacy and data controls · metahunt",
  description:
    "What MetaHunt processes for job alerts and CV matching, what it stores, and how to delete it.",
  alternates: { canonical: `${SITE_URL}/privacy` },
};

export default function PrivacyPage() {
  return (
    <>
      <Header cta={null} />
      <main className="bg-bg px-6 py-16 md:px-12 md:py-24">
        <article className="mx-auto flex w-full max-w-[900px] flex-col gap-12">
          <header className="flex flex-col gap-5 border-b border-border pb-10">
            <Tag>&gt; privacy · effective 22 July 2026</Tag>
            <h1 className="font-display text-4xl font-black tracking-tight text-text-primary sm:text-5xl">
              Your search data should stay understandable and controllable.
            </h1>
            <p className="max-w-[760px] text-base leading-relaxed text-text-secondary">
              This page describes the current MetaHunt product behaviour: what data is processed,
              why it is needed, which services receive it, and the controls available to you.
            </p>
          </header>

          <PrivacySection title="Browsing and job alerts">
            <p>
              You can browse vacancies without an account. When you create a Telegram alert,
              MetaHunt stores the selected filter, an opaque subscription ID, the Telegram chat
              needed for delivery, delivery state, and the vacancy IDs already sent so later digests
              do not repeat them.
            </p>
            <p>
              Use the bot&apos;s <code>/list</code> command to review alerts, its unsubscribe button
              to remove one, or <code>/stop</code> to disable notifications.
            </p>
          </PrivacySection>

          <PrivacySection id="cv" title="CV matching">
            <Card className="border-accent/50 bg-accent-subtle-bg shadow-brut-sm">
              <p className="font-display text-lg font-bold text-text-primary">
                Your CV text is sent to DeepSeek for structured extraction.
              </p>
              <p className="text-sm leading-relaxed text-text-secondary">
                MetaHunt processes the raw text in memory and writes an empty value to its legacy
                raw-text column. It stores the derived profile needed for matching: role, seniority,
                experience, English level, and extracted skills.
              </p>
            </Card>
            <p>
              A Telegram-authenticated account is required before upload. Uploaded profiles are
              owner-scoped: another account cannot read, rank, edit, or subscribe using your
              candidate ID. Public demo profiles are synthetic seeded data, not user CVs.
            </p>
            <p>
              Delete a CV from <Link href="/me">My account</Link>. This removes the account link and
              its CV-based subscriptions; when you are the final owner, the derived candidate
              profile and skills are deleted too.
            </p>
          </PrivacySection>

          <PrivacySection title="Telegram login and account data">
            <p>
              Telegram login provides MetaHunt with your Telegram account ID and, when available,
              username and first name. They are used to verify the login, create your MetaHunt
              account, enforce ownership, and deliver requested alerts. MetaHunt does not send raw
              Telegram identifiers to PostHog analytics.
            </p>
          </PrivacySection>

          <PrivacySection title="Retention and deletion">
            <p>
              Active account data, CV-derived profiles, subscriptions, and sent-vacancy history are
              kept while you use those features. Pending alerts that are never linked to Telegram
              are removed after 48 hours.
            </p>
            <p>
              You can delete an individual CV or subscription, or permanently delete your account
              from <Link href="/me">My account</Link>. Account deletion removes the Telegram
              identity, owned and same-chat subscriptions, notification history, CV ownership, and
              any derived candidate profile that has no remaining owner. The old session stops
              authorizing API requests immediately.
            </p>
          </PrivacySection>

          <PrivacySection title="Product analytics">
            <p>
              MetaHunt uses PostHog&apos;s EU endpoint and Vercel Analytics to understand visits,
              funnel steps, feature usage, and technical performance. Campaign identifiers may be
              recorded. CV text, filenames, email addresses, raw Telegram identifiers, full alert
              filters, and vacancy descriptions are not analytics properties.
            </p>
            <p>
              Candidate IDs in <code>?cv=</code> links are redacted from PostHog&apos;s captured URL
              and referrer properties.
            </p>
            <p>
              Account deletion removes MetaHunt&apos;s application records but does not itself erase
              historical pseudonymous events already held by analytics providers. Contact the
              project owner below for a provider-level analytics deletion request.
            </p>
          </PrivacySection>

          <PrivacySection title="Service providers and outbound links">
            <ul className="grid gap-3">
              <li>
                <strong>Vercel</strong> serves the web application and performance analytics.
              </li>
              <li>
                <strong>Railway and PostgreSQL</strong> run the API and store application data.
              </li>
              <li>
                <strong>DeepSeek</strong> receives CV text for structured extraction.
              </li>
              <li>
                <strong>Telegram</strong> handles login, bot commands, and alert delivery.
              </li>
              <li>
                <strong>PostHog EU</strong> receives the bounded product events described above.
              </li>
            </ul>
            <p>
              Clicking an original vacancy opens DOU or Djinni. That site then handles the visit
              under its own privacy terms.
            </p>
          </PrivacySection>

          <PrivacySection title="Contact and deletion requests">
            <p>
              Self-service controls cover accounts, CVs, and subscriptions. For a waitlist email or
              another data request, contact the project owner on{" "}
              <a href="https://t.me/m4xx1k">Telegram</a> or{" "}
              <a href="https://www.linkedin.com/in/maksym-fabin">LinkedIn</a>.
            </p>
          </PrivacySection>

          <Link
            href="/"
            className="inline-flex w-fit items-center gap-2 font-mono text-xs uppercase tracking-wider text-text-secondary transition-colors hover:text-accent"
          >
            <ArrowLeftIcon className="h-4 w-4" aria-hidden /> Back to jobs
          </Link>
        </article>
      </main>
      <Footer />
    </>
  );
}

function PrivacySection({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="mb-4 font-display text-2xl font-bold text-text-primary">{title}</h2>
      <div className="flex flex-col gap-4 text-sm leading-relaxed text-text-secondary [&_a]:text-accent [&_a]:underline [&_code]:font-mono [&_code]:text-accent [&_strong]:text-text-primary">
        {children}
      </div>
    </section>
  );
}
