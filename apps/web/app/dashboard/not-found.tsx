import Link from "next/link";

// 404 inside the console — renders in the console shell, so the sidebar stays
// put and the operator can keep navigating.
export default function ConsoleNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 p-10">
      <span className="font-display text-4xl font-black leading-none text-accent">404</span>
      <p className="max-w-[44ch] text-center font-mono text-xs text-text-muted">
        no such screen, run, or record. it may have been removed, or the id is wrong.
      </p>
      <Link
        href="/dashboard"
        className="border border-border px-4 py-2 font-mono text-xs text-text-secondary transition-colors hover:border-accent hover:text-accent"
      >
        back to overview
      </Link>
    </div>
  );
}
