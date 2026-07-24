import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "404 · metahunt",
  robots: { index: false, follow: false },
};

// Global 404. The home feed is a catch-all route, so anything it can't resolve
// (an unknown track slug, a stale link) lands here.
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-bg px-6 py-16">
      <Link href="/" aria-label="metahunt" className="flex items-center gap-3">
        <Image src="/logo.webp" alt="" width={28} height={28} className="rounded-full" />
        <span className="font-display text-lg font-bold tracking-tight text-text-primary">
          metahunt
        </span>
      </Link>

      <div className="flex flex-col items-center gap-3">
        <span className="font-display text-6xl font-black leading-none text-accent">404</span>
        <p className="max-w-[42ch] text-center font-mono text-sm text-text-secondary">
          This page doesn&apos;t exist — it may have moved or never did.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="border border-transparent bg-accent px-5 py-2.5 font-mono text-sm font-bold text-bg transition-opacity hover:opacity-90"
        >
          Open the feed
        </Link>
        <Link
          href="/how-it-works"
          className="border border-border px-5 py-2.5 font-mono text-sm text-text-secondary transition-colors hover:border-accent hover:text-accent"
        >
          How it works
        </Link>
      </div>
    </div>
  );
}
