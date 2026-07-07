export function SubStats({ items }: { items: { value: string; label: string }[] }) {
  return (
    <div className="mb-4 flex flex-wrap gap-2.5">
      {items.map((it) => (
        <div key={it.label} className="min-w-[108px] border border-border bg-bg-elev px-3 py-2">
          <div className="font-mono text-base font-bold leading-tight text-accent">
            {it.value}
          </div>
          <div className="font-body text-2xs text-text-secondary">{it.label}</div>
        </div>
      ))}
    </div>
  );
}
