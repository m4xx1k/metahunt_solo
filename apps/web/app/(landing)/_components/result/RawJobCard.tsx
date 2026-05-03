import { cn } from "@/lib/utils";

export function RawJobCard({
  title,
  source,
  className,
}: {
  title: string;
  source: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-full flex-col gap-2 border border-border bg-bg-card p-5 shadow-[4px_4px_0_0_#000]",
        className,
      )}
    >
      <div className="font-mono text-base text-text-primary">{title}</div>
      <div className="font-mono text-xs text-text-muted">{source}</div>
    </div>
  );
}
