"use client";

// Animated shell shared by all three stages. The stage-specific visual is
// passed in as `children` (a client visual from Visuals.tsx). Same neo-brutalist
// box; uniqueness comes from the accent colour + the visual inside.

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { PipelineAccent } from "./data";

export const accentText: Record<PipelineAccent, string> = {
  secondary: "text-accent-secondary",
  accent: "text-accent",
  success: "text-success",
};

export const accentBg: Record<PipelineAccent, string> = {
  secondary: "bg-accent-secondary",
  accent: "bg-accent",
  success: "bg-success",
};

// matches --animate-sheet-up easing so motion feels native to the app
export const EASE = [0.32, 0.72, 0, 1] as const;

export function PipelineCard({
  n,
  title,
  lead,
  accent,
  index,
  cta,
  children,
}: {
  n: string;
  title: string;
  lead: string;
  accent: PipelineAccent;
  index: number;
  cta?: { label: string; href: string };
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, delay: index * 0.12, ease: EASE }}
      whileHover={{ y: -4 }}
      className="group relative flex w-full flex-col gap-4 overflow-hidden border border-border bg-bg-card p-6 shadow-brut-lg xl:w-[320px]"
    >
      <motion.span
        aria-hidden
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6, delay: index * 0.12 + 0.15, ease: EASE }}
        className={cn("absolute inset-x-0 top-0 h-1 origin-left", accentBg[accent])}
      />

      <div className="flex items-baseline gap-3">
        <span
          className={cn(
            "font-mono text-2xl font-bold leading-none",
            accentText[accent],
          )}
        >
          {n}
        </span>
        <h3 className="font-display text-2xl font-bold text-text-primary">
          {title}
        </h3>
      </div>

      <p className="font-body text-sm leading-[1.5] text-text-secondary">
        {lead}
      </p>

      {/* stage-specific visual — the part that reads in a second */}
      <div className="py-2">{children}</div>

      {cta && (
        <a
          href={cta.href}
          className={cn(
            "mt-auto inline-flex items-center justify-center gap-2 border border-transparent px-5 py-3 font-body text-sm font-semibold text-bg shadow-brut-sm transition-[transform,box-shadow] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-brut-2xs active:translate-x-[2px] active:translate-y-[2px]",
            accentBg[accent],
          )}
        >
          {cta.label}
          <span aria-hidden>{"=>"}</span>
        </a>
      )}
    </motion.div>
  );
}
