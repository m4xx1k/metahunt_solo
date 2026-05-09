import { cn } from "@/lib/utils";
import type { Seniority } from "@/lib/extracted-vacancy";

const TONE: Record<Seniority, string> = {
  INTERN: "border-text-muted text-text-muted",
  JUNIOR: "border-accent-secondary text-accent-secondary",
  MIDDLE: "border-accent text-accent",
  SENIOR: "border-accent bg-accent text-bg",
  LEAD: "border-success text-success",
  PRINCIPAL: "border-success bg-success text-bg",
  C_LEVEL: "border-success bg-success text-bg",
};

const LABEL: Record<Seniority, string> = {
  INTERN: "intern",
  JUNIOR: "junior",
  MIDDLE: "middle",
  SENIOR: "senior",
  LEAD: "lead",
  PRINCIPAL: "principal",
  C_LEVEL: "c-level",
};

export function SeniorityBadge({
  seniority,
  className,
}: {
  seniority: Seniority;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center border px-2 py-[3px] font-mono text-[10px] font-bold uppercase tracking-[0.2em]",
        TONE[seniority],
        className,
      )}
    >
      {LABEL[seniority]}
    </span>
  );
}
