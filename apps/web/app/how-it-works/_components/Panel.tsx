import { cn } from "@/lib/utils";

export function Panel({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("border border-border-strong bg-bg-card p-5 shadow-brut-md", className)}>
      <div className="mb-3 font-mono text-2xs font-bold uppercase tracking-widest text-text-muted">
        {label}
      </div>
      {children}
    </div>
  );
}
