"use client";

import { useEffect, useState } from "react";
import { animate, motion, useMotionValue, useReducedMotion } from "framer-motion";

import type { AggregateSourceCount } from "@/lib/api/aggregates";

type Props = {
  total: number;
  lastSyncAt: string | null;
  sources: AggregateSourceCount[];
};

function relativeMinutes(iso: string | null): string {
  if (!iso) return "не оновлено";
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.max(0, Math.round(diffMs / 60000));
  if (min < 1) return "оновлено щойно";
  if (min < 60) return `оновлено ${min} хв тому`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `оновлено ${hr} год тому`;
  const d = Math.round(hr / 24);
  return `оновлено ${d} дн тому`;
}

// Computes the relative-time label on the client only, avoiding a
// server/client hydration mismatch when Date.now() differs across the
// SSR/CSR boundary. Refreshes every minute so the label stays accurate.
function RelativeTime({ iso }: { iso: string | null }) {
  const [label, setLabel] = useState("оновлено…");
  useEffect(() => {
    const update = () => setLabel(relativeMinutes(iso));
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [iso]);
  return <>{label}</>;
}

const FORMATTER = new Intl.NumberFormat("uk-UA");

function CountUp({ value }: { value: number }) {
  const reduced = useReducedMotion();
  const skip = reduced || value < 50;
  const mv = useMotionValue(0);
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    if (skip) return;
    const controls = animate(mv, value, {
      duration: 0.8,
      ease: "easeOut",
      onUpdate: (v) => setAnimated(Math.round(v)),
    });
    return () => controls.stop();
  }, [value, skip, mv]);

  return <>{FORMATTER.format(skip ? value : animated)}</>;
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

export function TotalCounter({ total, lastSyncAt, sources }: Props) {
  const sourceLabel = sources.map((s) => s.displayName).join(" + ") || "—";
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-bg-card px-8 py-6 md:items-end md:text-right">
      <span className="font-display text-6xl font-bold leading-none text-text-primary md:text-7xl">
        <CountUp value={total} />
      </span>
      <span className="font-body text-sm text-text-secondary">
        вакансій у базі
      </span>
      <span className="flex items-center gap-2 font-mono text-xs text-text-muted">
        <StatusDot />
        <RelativeTime iso={lastSyncAt} /> · {sourceLabel}
      </span>
    </div>
  );
}
