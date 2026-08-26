import { cn } from "@/lib/utils";

const TONES = {
  required: "border-accent text-accent",
  optional: "border-border-strong text-text-secondary",
  have: "border-success text-success",
  missing: "border-danger text-danger",
  bonus: "border-border text-text-muted",
} as const;

export type SkillTone = keyof typeof TONES;

const GLYPHS: Partial<Record<SkillTone, string>> = { have: "✓", missing: "✗" };

// One knob, not two: `xs` is the old `compact`, `md` is the vacancy page's hero
// row, where skills are a headline fact rather than a footnote.
const SIZES = {
  xs: "px-1.5 py-[1px] text-2xs",
  sm: "px-2 py-[2px] text-xs",
  md: "px-2.5 py-1 text-sm",
} as const;

export type SkillSize = keyof typeof SIZES;

export function SkillChip({
  name,
  tone,
  size = "sm",
  hash = false,
  glyph = false,
  dotted = false,
}: {
  name: string;
  tone: SkillTone;
  size?: SkillSize;
  hash?: boolean;
  glyph?: boolean;
  dotted?: boolean;
}) {
  const mark = glyph ? GLYPHS[tone] : undefined;
  return (
    <span className={cn("border font-mono", SIZES[size], dotted && "border-dotted", TONES[tone])}>
      {mark ? <span aria-hidden>{mark} </span> : null}
      {hash ? "#" : null}
      {name.toLowerCase()}
    </span>
  );
}
