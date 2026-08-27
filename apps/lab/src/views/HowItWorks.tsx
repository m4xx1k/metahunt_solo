export function HowItWorks({ children, onOpenFaq }: { children: React.ReactNode; onOpenFaq: () => void }) {
  return (
    <aside className="mt-4 flex flex-wrap items-start justify-between gap-3 border-l-2 border-signal pl-3.5 text-xs leading-relaxed text-ink-3">
      <p className="max-w-[72ch]">{children}</p>
      <button
        type="button"
        className="shrink-0 cursor-pointer text-signal underline underline-offset-2"
        onClick={onOpenFaq}
      >
        Terms &amp; FAQ
      </button>
    </aside>
  );
}
