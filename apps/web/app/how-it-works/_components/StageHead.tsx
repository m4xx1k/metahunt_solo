export function StageHead({ num, title }: { num: string; title: string }) {
  return (
    <div className="mb-4 flex items-baseline gap-3">
      <span className="inline-flex items-center bg-accent px-2.5 py-0.5 font-mono text-sm font-bold leading-none text-bg shadow-brut-2xs">
        {num}
      </span>
      <h2 className="font-display text-2xl font-bold text-text-primary">{title}</h2>
    </div>
  );
}
