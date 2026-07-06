import { cn } from "@/lib/utils";

// The one skill chip. Tones map to what the skill means in context:
// required/optional on vacancy cards, have/missing/bonus on the reverse-ATS
// diff lines. `compact` is the dense diff-line size; `hash` opts into a `#`
// prefix (off by default — it reads oddly for multi-word skills like
// "machine learning").
const TONES = {
  required: "border-accent text-accent",
  optional: "border-border-strong text-text-secondary",
  have: "border-success text-success",
  missing: "border-danger text-danger",
  bonus: "border-border text-text-muted",
} as const;

export type SkillTone = keyof typeof TONES;

// A ✓/✗ mark pairs with the have/missing colour so it is never the only signal.
const GLYPHS: Partial<Record<SkillTone, string>> = { have: "✓", missing: "✗" };

export function SkillChip({
  name,
  tone,
  compact = false,
  hash = false,
  glyph = false,
  dotted = false,
}: {
  name: string;
  tone: SkillTone;
  compact?: boolean;
  hash?: boolean;
  glyph?: boolean;
  dotted?: boolean;
}) {
  const mark = glyph ? GLYPHS[tone] : undefined;
  return (
    <span
      className={cn(
        "border font-mono",
        compact ? "px-1.5 py-[1px] text-2xs" : "px-2 py-[2px] text-xs",
        dotted && "border-dotted",
        TONES[tone],
      )}
    >
      {mark ? <span aria-hidden>{mark} </span> : null}
      {hash ? "#" : null}
      {name.toLowerCase()}
    </span>
  );
}
