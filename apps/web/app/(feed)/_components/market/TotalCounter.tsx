"use client";

import { useEffect, useRef, useState } from "react";
import { animate, motion, useMotionValue, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";
import type { AggregateSourceCount } from "@/lib/api/aggregates";
import { useFeedCount } from "../feed-count";

type Props = {
  total: number;
  lastSyncAt: string | null;
  sources: AggregateSourceCount[];
};

function relativeMinutes(iso: string | null): string {
  if (!iso) return "not updated";
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.max(0, Math.round(diffMs / 60000));
  if (min < 1) return "updated just now";
  if (min < 60) return `updated ${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `updated ${hr}h ago`;
  const d = Math.round(hr / 24);
  return `updated ${d}d ago`;
}

// Client-only so Date.now() can't differ across the SSR/CSR boundary.
function RelativeTime({ iso }: { iso: string | null }) {
  const [label, setLabel] = useState("updating…");
  useEffect(() => {
    const update = () => setLabel(relativeMinutes(iso));
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [iso]);
  return <>{label}</>;
}

const FORMATTER = new Intl.NumberFormat("en-US");

// First paint counts up from zero; every later change tweens from the number
// already on screen, so a filter toggle never drops the hero back to 0.
function CountUp({ value }: { value: number }) {
  const reduced = useReducedMotion();
  const mv = useMotionValue(value);
  const [shown, setShown] = useState(value);
  const mounted = useRef(false);

  useEffect(() => {
    if (reduced) return;
    const from = mounted.current ? mv.get() : 0;
    mounted.current = true;
    mv.set(from);
    const controls = animate(mv, value, {
      duration: from === 0 ? 0.8 : 0.35,
      ease: "easeOut",
      onUpdate: (v) => setShown(Math.round(v)),
    });
    return () => controls.stop();
  }, [value, reduced, mv]);

  return <>{FORMATTER.format(reduced ? value : shown)}</>;
}

function StatusDot() {
  const reduced = useReducedMotion();
  if (reduced) {
    return <span aria-hidden className="size-1.5 rounded-full bg-accent" />;
  }
  return (
    <motion.span
      aria-hidden
      className="size-1.5 rounded-full bg-accent"
      animate={{ opacity: [0.4, 1, 0.4] }}
      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

const SOURCES_SHOWN = 3;

export function TotalCounter({ total, lastSyncAt, sources }: Props) {
  const live = useFeedCount();
  const shown = sources.slice(0, SOURCES_SHOWN).map((s) => s.displayName);
  const extra = sources.length - shown.length;
  const sourceLabel =
    shown.length === 0 ? "—" : shown.join(" + ") + (extra > 0 ? ` +${extra}` : "");
  return (
    <div className="flex flex-col items-start gap-2 md:items-end md:justify-center md:text-right">
      <span
        aria-live="polite"
        className={cn(
          "font-display text-6xl font-bold leading-none text-accent transition-opacity duration-200 md:text-7xl",
          live?.pending && "opacity-50",
        )}
      >
        <CountUp value={live?.total ?? total} />
      </span>
      <span className="font-body text-sm text-text-secondary">вакансій</span>
      <span className="flex items-center gap-2 font-mono text-xs text-text-muted">
        <StatusDot />
        <RelativeTime iso={lastSyncAt} /> · {sourceLabel}
      </span>
    </div>
  );
}
