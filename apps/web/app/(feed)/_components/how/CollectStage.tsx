"use client";

import { motion, useReducedMotion } from "framer-motion";

const NUM = new Intl.NumberFormat("en-US");

const DJINNI = "#54c7c3";
const DOU = "#ffb84d";

// Two source pills piped down into one database. Flow = a marching dashed line
// inside each tube; kept deliberately simple (no falling text, no ticking).
const TUBES = [
  { d: "M64 58 C64 96 120 96 120 124", color: DJINNI },
  { d: "M176 58 C176 96 120 96 120 124", color: DOU },
  { d: "M120 124 L120 150", color: "var(--color-accent)" },
];

export function CollectStage({ total }: { total: number }) {
  const reduce = useReducedMotion();
  return (
    <div className="absolute inset-0 flex items-center justify-center p-3">
      <svg
        viewBox="0 0 240 210"
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
        fill="none"
      >
        {/* source pills — link out to the live RSS feeds */}
        <SourcePill x={28} label="djinni" color={DJINNI} href="https://djinni.co/jobs/rss/" />
        <SourcePill x={140} label="dou" color={DOU} href="https://jobs.dou.ua/vacancies/feeds/" />

        {/* tubes: thick casing + animated colored flow line */}
        {TUBES.map((t, i) => (
          <g key={i}>
            <path d={t.d} stroke="var(--color-border-strong)" strokeWidth={7} strokeLinecap="round" />
            <motion.path
              d={t.d}
              stroke={t.color}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeDasharray="5 9"
              animate={reduce ? undefined : { strokeDashoffset: [0, -28] }}
              transition={{ duration: 1.1, ease: "linear", repeat: Infinity }}
            />
          </g>
        ))}

        {/* database cylinder */}
        <ellipse cx={120} cy={152} rx={40} ry={8} fill="var(--color-bg-elev)" stroke="var(--color-accent)" strokeWidth={2} />
        <path
          d="M80 152 V184 A40 8 0 0 0 160 184 V152"
          fill="var(--color-bg-elev)"
          stroke="var(--color-accent)"
          strokeWidth={2}
        />
        <text x={120} y={174} textAnchor="middle" className="font-mono" fontSize={11} fontWeight={700} fill="var(--color-accent)">
          one store
        </text>
        <text x={120} y={202} textAnchor="middle" className="font-mono" fontSize={10} fill="var(--color-text-secondary)">
          {NUM.format(total)} · deduped
        </text>
      </svg>
    </div>
  );
}

function SourcePill({
  x,
  label,
  color,
  href,
}: {
  x: number;
  label: string;
  color: string;
  href: string;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="cursor-pointer transition-opacity hover:opacity-70">
      <title>{`${label} RSS feed`}</title>
      <rect x={x} y={32} width={72} height={26} fill="var(--color-bg-card)" stroke={color} strokeWidth={2} />
      <text x={x + 36} y={49} textAnchor="middle" className="font-mono" fontSize={12} fontWeight={700} fill={color}>
        {label}
      </text>
    </a>
  );
}
