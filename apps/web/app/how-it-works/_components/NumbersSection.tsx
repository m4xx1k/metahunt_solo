import { numbers } from "./data";
import { StageHead } from "./StageHead";

export function NumbersSection() {
  return (
    <section id="numbers" className="scroll-mt-24 border-t border-border py-14">
      <StageHead num="#" title="the numbers" />
      <p className="mb-6 font-body text-sm text-text-secondary">
        Real figures from the running system. Snapshots dated; estimates flagged.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {numbers.items.map((item) => (
          <div key={item.label} className="border border-border-strong bg-bg-card p-4 shadow-brut-sm">
            <div className="font-mono text-xl font-bold text-accent">{item.value}</div>
            <div className="mt-0.5 font-body text-sm text-text-primary">{item.label}</div>
            <div className="mt-1.5 font-mono text-2xs text-text-muted">{item.note}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
