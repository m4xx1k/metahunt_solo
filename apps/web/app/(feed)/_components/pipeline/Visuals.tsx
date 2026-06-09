"use client";

// The three stage-specific mini-visuals. Each is meant to read in a second:
//  · SourcesVisual — real sources (from aggregates) stack into one feed
//  · ExtractVisual — raw text bars collapse into structured tags
//  · MatchVisual   — ranked match-score bars fill up
// All animate in once on scroll, staggered, sharing the card's accent colour.

import { motion } from "framer-motion";

import type { AggregateSourceCount } from "@/lib/api/aggregates";
import { Badge } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { accentBg, accentText, EASE } from "./PipelineCard";
import type { PipelineAccent } from "./data";

const NUM = new Intl.NumberFormat("uk-UA");
const VIEWPORT = { once: true, margin: "-60px" } as const;

// ── 01 · Збір ────────────────────────────────────────────────────────────────
export function SourcesVisual({
  sources,
  accent,
}: {
  sources: AggregateSourceCount[];
  accent: PipelineAccent;
}) {
  const top = [...sources].sort((a, b) => b.count - a.count).slice(0, 4);

  return (
    <div className="flex flex-col gap-2">
      {top.map((s, i) => (
        <motion.div
          key={s.id}
          initial={{ opacity: 0, x: -16 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.4, delay: 0.1 + i * 0.08, ease: EASE }}
          className="flex items-center justify-between border border-border bg-bg-elev px-3 py-2"
        >
          <span className="flex items-center gap-2 font-body text-[13px] text-text-primary">
            <span className={cn("h-2 w-2", accentBg[accent])} />
            {s.displayName}
          </span>
          <span className="font-mono text-[12px] text-text-muted">
            {NUM.format(s.count)}
          </span>
        </motion.div>
      ))}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={VIEWPORT}
        transition={{ duration: 0.4, delay: 0.1 + top.length * 0.08, ease: EASE }}
        className="mt-1 flex items-baseline gap-2 border-t border-border pt-3"
      >
        <span className={cn("font-mono text-2xl font-bold leading-none", accentText[accent])}>
          {sources.length}
        </span>
        <span className="font-body text-[13px] text-text-muted">
          джерел · оновлення щогодини
        </span>
      </motion.div>
    </div>
  );
}

// ── 02 · Розбір ──────────────────────────────────────────────────────────────
const RAW_BARS = ["92%", "78%", "64%"]; // skeleton widths for the "raw text"

export function ExtractVisual({
  fields,
  accent,
}: {
  fields: string[];
  accent: PipelineAccent;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        {RAW_BARS.map((w, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 0.5 }}
            viewport={VIEWPORT}
            transition={{ duration: 0.3, delay: i * 0.06, ease: EASE }}
            className="h-2 rounded-sm bg-border-strong"
            style={{ width: w }}
          />
        ))}
      </div>
      <span aria-hidden className={cn("font-mono text-lg leading-none", accentText[accent])}>
        ↓
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {fields.map((f, i) => (
          <motion.span
            key={f}
            initial={{ opacity: 0, scale: 0.7 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={VIEWPORT}
            transition={{ duration: 0.3, delay: 0.3 + i * 0.07, ease: EASE }}
          >
            <Badge
              variant={i === 0 ? "accent" : "dark"}
              className="box-border h-6 leading-none"
            >
              {f}
            </Badge>
          </motion.span>
        ))}
        {/* the reservation pill, styled like the one on vacancy cards */}
        <motion.span
          initial={{ opacity: 0, scale: 0.7 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={VIEWPORT}
          transition={{
            duration: 0.3,
            delay: 0.3 + fields.length * 0.07,
            ease: EASE,
          }}
          className="box-border mt-0.5 inline-flex h-6 items-center gap-1.5 px-2 font-mono text-[11px] font-bold uppercase leading-none tracking-wider text-success ring-1 ring-inset ring-success"
        >
          <span aria-hidden className="text-[10px] leading-none">
            🛡
          </span>
          бронь
        </motion.span>
      </div>
    </div>
  );
}

// ── 03 · Підбір ──────────────────────────────────────────────────────────────
export function MatchVisual({
  scores,
  accent,
}: {
  scores: number[];
  accent: PipelineAccent;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {scores.map((score, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-2.5 flex-1 bg-bg-elev">
            <motion.div
              initial={{ width: 0 }}
              whileInView={{ width: `${score}%` }}
              viewport={VIEWPORT}
              transition={{ duration: 0.7, delay: 0.15 + i * 0.12, ease: EASE }}
              className={cn("h-full", accentBg[accent])}
            />
          </div>
          <span className={cn("w-9 text-right font-mono text-[13px] font-bold", accentText[accent])}>
            {score}%
          </span>
        </div>
      ))}
    </div>
  );
}
