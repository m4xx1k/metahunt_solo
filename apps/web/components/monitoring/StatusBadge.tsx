import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { IngestStatus } from "@/lib/api/monitoring";

const styles = cva(
  "inline-flex items-center px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-wider border border-transparent",
  {
    variants: {
      status: {
        running: "bg-accent text-bg",
        completed: "bg-success text-bg",
        failed: "bg-danger text-bg",
      },
    },
  },
);

export function StatusBadge({
  status,
  className,
}: {
  status: IngestStatus | string;
  className?: string;
}) {
  const known = (["running", "completed", "failed"] as const).includes(
    status as IngestStatus,
  );
  return (
    <span
      className={cn(
        known
          ? styles({ status: status as IngestStatus })
          : "inline-flex items-center px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-wider border border-border bg-bg-elev text-text-secondary",
        className,
      )}
    >
      {status}
    </span>
  );
}
