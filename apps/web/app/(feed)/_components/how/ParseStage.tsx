"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import { PARSE_SAMPLES, type BadgeTone, type ParseSample } from "./data";

const TONE: Record<BadgeTone, string> = {
  sen: "text-accent border-accent/50 bg-accent-subtle-bg",
  role: "text-accent-secondary border-accent-secondary/50 bg-accent-secondary/10",
  money: "text-success border-success/50 bg-success/10",
  plain: "text-text-primary border-border-strong bg-bg-elev",
  reservation: "text-success border-success bg-success/10",
};

export function ParseStage() {
  const [si, setSi] = useState(0);
  const onDone = useCallback(
    () => setSi((v) => (v + 1) % PARSE_SAMPLES.length),
    [],
  );
  // Keyed remount per sample → fresh typing state without resetting in an effect.
  return <TypeOut key={si} sample={PARSE_SAMPLES[si]} onDone={onDone} />;
}

function TypeOut({ sample, onDone }: { sample: ParseSample; onDone: () => void }) {
  const reduce = useReducedMotion();
  const [typed, setTyped] = useState(reduce ? sample.text : "");
  const [shown, setShown] = useState(reduce ? sample.badges.length : 0);

  useEffect(() => {
    const timers: number[] = [];
    if (reduce) {
      timers.push(window.setTimeout(onDone, 4500));
      return () => timers.forEach(window.clearTimeout);
    }
    let i = 0;
    const speed = Math.max(12, Math.floor(1500 / sample.text.length));
    const typeId = window.setInterval(() => {
      i += 1;
      setTyped(sample.text.slice(0, i));
      if (i >= sample.text.length) {
        window.clearInterval(typeId);
        sample.badges.forEach((_, k) =>
          timers.push(window.setTimeout(() => setShown(k + 1), 120 + k * 160)),
        );
        timers.push(window.setTimeout(onDone, 120 + sample.badges.length * 160 + 1800));
      }
    }, speed);
    return () => {
      window.clearInterval(typeId);
      timers.forEach(window.clearTimeout);
    };
  }, [sample, reduce, onDone]);

  return (
    <div className="absolute inset-0 flex flex-col px-[18px] py-[14px]">
      {!reduce && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 z-0 h-10"
          style={{
            background:
              "linear-gradient(to bottom, transparent, rgba(255,179,128,0.07), transparent)",
          }}
          initial={{ top: "-40px" }}
          animate={{ top: ["-40px", "100%"] }}
          transition={{ duration: 4, ease: "linear", repeat: Infinity }}
        />
      )}

      <div className="relative z-[2] min-h-[88px] font-mono text-[13.5px] font-medium leading-[1.6] text-text-primary">
        {typed}
        <span
          aria-hidden
          className="ml-0.5 inline-block h-[15px] w-2 animate-pulse bg-accent align-[-2px]"
        />
      </div>

      <div className="relative z-[2] my-3 h-px bg-border" />

      <div className="relative z-[2] flex min-h-[60px] flex-wrap content-start gap-1.5">
        {sample.badges.map((b, k) => (
          <span
            key={b.label}
            className={cn(
              "border-[1.5px] px-2 py-[3px] font-mono text-[10.5px] font-bold transition-all duration-200",
              b.tone === "reservation" && "inline-flex items-center gap-1",
              TONE[b.tone],
              k < shown ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
            )}
          >
            {b.tone === "reservation" && (
              <ShieldCheck aria-hidden className="h-3 w-3" strokeWidth={2.5} />
            )}
            {b.label}
          </span>
        ))}
      </div>
    </div>
  );
}
