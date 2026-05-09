export default function MonitoringLoading() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg">
      <span className="font-mono text-xs uppercase tracking-wider text-text-muted">
        loading monitoring data…
      </span>
      <div className="h-1 w-40 animate-pulse bg-accent" />
    </main>
  );
}
