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

// Outline-only variant: never filled, so it stays a quiet qualifier next to
// the role on the feed card (the filled tones win in dense lists elsewhere).
// Exported so the seniority filter pills carry the same per-level colours.
export const SENIORITY_OUTLINE_TONE: Record<Seniority, string> = {
  INTERN: "border-text-muted text-text-muted",
  JUNIOR: "border-accent-secondary text-accent-secondary",
  MIDDLE: "border-accent text-accent",
  SENIOR: "border-accent text-accent",
  LEAD: "border-success text-success",
  PRINCIPAL: "border-success text-success",
  C_LEVEL: "border-success text-success",
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
  outline = false,
  className,
}: {
  seniority: Seniority;
  outline?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center border px-2 py-[3px] font-mono text-2xs font-bold uppercase tracking-[0.2em]",
        outline ? SENIORITY_OUTLINE_TONE[seniority] : TONE[seniority],
        className,
      )}
    >
      {LABEL[seniority]}
    </span>
  );
}
