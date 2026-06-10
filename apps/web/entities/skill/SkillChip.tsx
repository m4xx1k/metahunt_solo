import { cn } from "@/lib/utils";

// The one skill chip. Tones map to what the skill means in context:
// required/optional on vacancy cards, have/missing/bonus on the reverse-ATS
// diff lines. `compact` is the dense diff-line size; `hash` is the feed-style
// `#` prefix (diff lines drop it).
const TONES = {
  required: "border-accent text-accent",
  optional: "border-border text-text-secondary",
  have: "border-success text-success",
  missing: "border-danger text-danger",
  bonus: "border-border text-text-muted",
} as const;

export type SkillTone = keyof typeof TONES;

export function SkillChip({
  name,
  tone,
  compact = false,
  hash = true,
}: {
  name: string;
  tone: SkillTone;
  compact?: boolean;
  hash?: boolean;
}) {
  return (
    <span
      className={cn(
        "border font-mono",
        compact ? "px-1.5 py-[1px] text-[11px]" : "px-2 py-[2px] text-xs",
        TONES[tone],
      )}
    >
      {hash ? "#" : null}
      {name.toLowerCase()}
    </span>
  );
}
