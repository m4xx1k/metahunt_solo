import { stack } from "./data";

export function StackSection() {
  return (
    <section id="stack" className="scroll-mt-24 border-t border-border py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="font-display text-xl font-bold text-text-primary">built with</h2>
        <p className="font-mono text-xs text-text-muted">{stack.context}</p>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {stack.items.map((item) => (
          <a
            key={item.name}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            className="border border-border-strong bg-bg-elev px-3 py-1.5 font-mono text-xs font-semibold text-text-primary transition-colors hover:border-accent-secondary hover:text-accent-secondary"
          >
            {item.name}
          </a>
        ))}
      </div>
    </section>
  );
}
