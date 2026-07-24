export default function ConsoleLoading() {
  return (
    <div className="flex flex-1 items-center justify-center gap-3 p-10">
      <span className="font-mono text-2xs uppercase tracking-[0.12em] text-text-muted">
        loading
      </span>
      <div className="h-px w-24 animate-pulse bg-accent" />
    </div>
  );
}
