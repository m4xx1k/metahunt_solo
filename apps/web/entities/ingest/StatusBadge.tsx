import { cn } from "@/lib/utils";
import type { IngestStatus } from "@/lib/api/monitoring";

const DOT: Record<IngestStatus, string> = {
  running: "bg-accent",
  completed: "bg-success",
  failed: "bg-danger",
};

const TEXT: Record<IngestStatus, string> = {
  running: "text-accent",
  completed: "text-success",
  failed: "text-danger",
};

const LABEL: Record<IngestStatus, string> = {
  running: "running",
  completed: "ok",
  failed: "failed",
};

function isKnown(status: string): status is IngestStatus {
  return status === "running" || status === "completed" || status === "failed";
}

export function StatusBadge({
  status,
  className,
}: {
  status: IngestStatus | string;
  className?: string;
}) {
  const known = isKnown(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-2xs uppercase tracking-[0.12em]",
        known ? TEXT[status] : "text-text-muted",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("size-1.5 shrink-0", known ? DOT[status] : "bg-text-muted")}
      />
      {known ? LABEL[status] : status}
    </span>
  );
}
