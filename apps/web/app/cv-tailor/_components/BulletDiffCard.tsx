"use client";

import { useEffect, useRef, useState } from "react";

import { cvTailorApi, type BulletDiff, type GuardResult } from "@/lib/api/cv-tailor";

import { wordDiff } from "./diff";

export function BulletDiffCard({
  bullet,
  ledgerTech,
}: {
  bullet: BulletDiff;
  ledgerTech: string[];
}) {
  const [applied, setApplied] = useState(bullet.tailoredText);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(bullet.tailoredText);
  const [verdict, setVerdict] = useState<GuardResult>(bullet.verdict);
  const [checking, setChecking] = useState(false);
  const seq = useRef(0);

  // Live subset-guard re-check while editing (debounced, deterministic, no LLM).
  useEffect(() => {
    if (!editing) return;
    const mine = ++seq.current;
    const id = setTimeout(() => {
      setChecking(true);
      cvTailorApi
        .verify({
          sourceText: bullet.sourceText,
          tailoredText: draft,
          sourceEntities: bullet.sourceEntities,
          ledgerTech,
        })
        .then((v) => {
          if (mine === seq.current) setVerdict(v);
        })
        .catch(() => undefined)
        .finally(() => {
          if (mine === seq.current) setChecking(false);
        });
    }, 400);
    return () => clearTimeout(id);
  }, [draft, editing, bullet, ledgerTech]);

  const changed = applied.trim() !== bullet.sourceText.trim();

  return (
    <div className="flex flex-col gap-3 border border-border bg-bg-card p-4 shadow-brut-sm">
      {/* the tailored line (word-diff when it differs from source) */}
      <div className="font-body text-sm leading-relaxed text-text-primary">
        {editing ? null : changed ? (
          <DiffText source={bullet.sourceText} tailored={applied} />
        ) : (
          <span>{applied}</span>
        )}
      </div>

      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          autoFocus
          className="w-full resize-y border border-border-strong bg-bg px-3 py-2 font-body text-sm text-text-primary focus:outline-none"
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Verdict verdict={verdict} checking={checking} mode={bullet.mode} changed={changed} />
        <div className="ml-auto flex items-center gap-3">
          {editing ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setApplied(draft);
                  setEditing(false);
                }}
                className="font-mono text-2xs uppercase tracking-wider text-accent hover:underline"
              >
                done
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(bullet.tailoredText);
                  setApplied(bullet.tailoredText);
                  setVerdict(bullet.verdict);
                  setEditing(false);
                }}
                className="font-mono text-2xs uppercase tracking-wider text-text-muted hover:text-danger hover:underline"
              >
                revert
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setDraft(applied);
                setEditing(true);
              }}
              className="font-mono text-2xs uppercase tracking-wider text-text-muted hover:text-accent hover:underline"
            >
              edit
            </button>
          )}
        </div>
      </div>

      <Chips bullet={bullet} />

      {verdict.flags.length > 0 ? (
        <ul className="flex flex-col gap-1 border-t border-border pt-2">
          {verdict.flags.map((f, i) => (
            <li key={i} className="font-mono text-2xs leading-relaxed text-danger">
              ⚠ {f.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function DiffText({ source, tailored }: { source: string; tailored: string }) {
  return (
    <span>
      {wordDiff(source, tailored).map((p, i) => {
        if (p.type === "same") return <span key={i}>{p.value}</span>;
        if (p.type === "del")
          return (
            <span key={i} className="text-text-muted line-through decoration-danger/50">
              {p.value}
            </span>
          );
        return (
          <span key={i} className="font-semibold text-success underline decoration-success/60">
            {p.value}
          </span>
        );
      })}
    </span>
  );
}

function Verdict({
  verdict,
  checking,
  mode,
  changed,
}: {
  verdict: GuardResult;
  checking: boolean;
  mode: BulletDiff["mode"];
  changed: boolean;
}) {
  if (checking) {
    return <Pill tone="muted">checking…</Pill>;
  }
  if (!verdict.faithful) {
    return (
      <Pill tone="danger">
        ⚠ {verdict.flags.length} invented fact{verdict.flags.length > 1 ? "s" : ""} blocked
      </Pill>
    );
  }
  const label = changed
    ? mode === "rephrased"
      ? "reworded — verified, no new facts"
      : "edited — verified, no new facts"
    : "kept verbatim — 100% grounded";
  return <Pill tone="success">✓ {label}</Pill>;
}

function Pill({
  tone,
  children,
}: {
  tone: "success" | "danger" | "muted";
  children: React.ReactNode;
}) {
  const cls =
    tone === "success"
      ? "border-success text-success"
      : tone === "danger"
        ? "border-danger text-danger"
        : "border-border text-text-muted";
  return (
    <span
      className={`inline-flex items-center border px-2 py-1 font-mono text-2xs font-bold uppercase tracking-wider ${cls}`}
    >
      {children}
    </span>
  );
}

function Chips({ bullet }: { bullet: BulletDiff }) {
  const { tech, metrics, orgs } = bullet.sourceEntities;
  if (tech.length + metrics.length + orgs.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tech.map((t) => (
        <span
          key={`t-${t}`}
          className="border border-border bg-accent-subtle-bg px-1.5 py-0.5 font-mono text-2xs text-accent"
        >
          {t}
        </span>
      ))}
      {metrics.map((m) => (
        <span
          key={`m-${m}`}
          className="border border-border px-1.5 py-0.5 font-mono text-2xs text-text-secondary"
        >
          {m}
        </span>
      ))}
      {orgs.map((o) => (
        <span
          key={`o-${o}`}
          className="bg-text-primary px-1.5 py-0.5 font-mono text-2xs text-bg-card"
        >
          {o}
        </span>
      ))}
    </div>
  );
}
