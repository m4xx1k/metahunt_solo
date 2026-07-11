"use client";

import { useEffect, useState } from "react";

import { cvTailorApi, type GuardDemoCase } from "@/lib/api/cv-tailor";

import { wordDiff } from "./diff";

// The moat, made legible: canned before→after cases run through the REAL Tier-1
// guard server-side — genuine verdicts, no LLM. Shows exactly what gets blocked.
export function GuardDemoPanel() {
  const [cases, setCases] = useState<GuardDemoCase[] | null>(null);

  useEffect(() => {
    cvTailorApi
      .guardDemo()
      .then(setCases)
      .catch(() => setCases([]));
  }, []);

  if (!cases || cases.length === 0) return null;

  return (
    <section className="flex flex-col gap-4 border-t border-border pt-8">
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-bold text-text-primary">
          <span className="text-accent">3 · </span>How the guarantee works
        </h2>
        <p className="max-w-2xl font-body text-xs leading-relaxed text-text-muted">
          A deterministic guard recomputes every tailored line&apos;s facts and proves they are a
          subset of the source — no new technology, no changed number, no borrowed employer. These
          are real verdicts from that guard, run right now:
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {cases.map((c) => (
          <div
            key={c.title}
            className={`flex flex-col gap-3 border bg-bg-card p-4 shadow-brut-sm ${
              c.result.faithful ? "border-success" : "border-danger"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-mono text-2xs font-bold uppercase tracking-wider text-text-secondary">
                {c.title}
              </h3>
              <span
                className={`shrink-0 border px-2 py-0.5 font-mono text-2xs font-bold uppercase tracking-wider ${
                  c.result.faithful ? "border-success text-success" : "border-danger text-danger"
                }`}
              >
                {c.result.faithful ? "✓ allowed" : "⚠ blocked"}
              </span>
            </div>

            <p className="font-body text-sm leading-relaxed text-text-primary">
              {wordDiff(c.sourceText, c.tailoredText).map((p, i) => {
                if (p.type === "same") return <span key={i}>{p.value}</span>;
                if (p.type === "del")
                  return (
                    <span key={i} className="text-text-muted line-through decoration-danger/50">
                      {p.value}
                    </span>
                  );
                return (
                  <span
                    key={i}
                    className={`font-semibold underline ${
                      c.result.faithful
                        ? "text-success decoration-success/60"
                        : "text-danger decoration-danger/60"
                    }`}
                  >
                    {p.value}
                  </span>
                );
              })}
            </p>

            {c.result.flags.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {c.result.flags.map((f, i) => (
                  <li key={i} className="font-mono text-2xs leading-relaxed text-danger">
                    ⚠ {f.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="font-mono text-2xs leading-relaxed text-text-muted">{c.note}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
