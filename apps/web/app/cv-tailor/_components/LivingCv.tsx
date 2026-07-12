"use client";

import { useEffect, useRef, useState } from "react";

import {
  cvTailorApi,
  type BulletDiff,
  type GuardResult,
  type TailorResult,
} from "@/lib/api/cv-tailor";

import { wordDiff } from "./diff";

// The tailored resume as one clean document. The diff lives inline: reworded
// words are subtly underlined, the original is one hover away, and any bullet is
// editable with a live guard. No side-by-side panels — the CV is the artifact.
export function LivingCv({ result, ledgerTech }: { result: TailorResult; ledgerTech: string[] }) {
  const r = result.resume;
  const contacts = [
    r.contacts.location,
    r.contacts.email,
    r.contacts.github,
    r.contacts.linkedin,
    r.contacts.telegram,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-6 border border-border-strong bg-bg-elev px-7 py-6 shadow-brut">
      <header className="flex flex-col gap-1 border-b border-border pb-3">
        <h2 className="font-display text-2xl font-bold text-text-primary">{r.name}</h2>
        <p className="font-body text-sm text-accent">{r.title}</p>
        <p className="font-mono text-2xs leading-relaxed text-text-muted">
          {contacts.join("  ·  ")}
        </p>
      </header>

      <Section label="Summary">
        <Bullet bullet={r.summary} ledgerTech={ledgerTech} block />
      </Section>

      <Section label="Skills">
        <div className="flex flex-col gap-1">
          {r.skills.map((g) =>
            g.added ? (
              <p
                key={g.group}
                className="border-l-2 border-danger bg-accent-subtle-bg py-1 pl-2 font-body text-xs leading-relaxed text-text-secondary"
              >
                <span className="font-semibold text-danger">{g.group}</span>
                <span className="ml-1 font-mono text-[0.6rem] uppercase tracking-wider text-danger">
                  not in your CV
                </span>{" "}
                — {g.items.join(" · ")}
              </p>
            ) : (
              <p key={g.group} className="font-body text-xs leading-relaxed text-text-secondary">
                <span className="font-semibold text-text-primary">{g.group}</span> —{" "}
                {g.items.join(" · ")}
              </p>
            ),
          )}
        </div>
      </Section>

      <Section label="Experience">
        <div className="flex flex-col gap-4">
          {r.experience.map((e) => (
            <div key={e.id} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-body text-sm font-semibold text-text-primary">
                  {e.role} · {e.org}
                </p>
                <span className="shrink-0 font-mono text-2xs text-text-muted">{e.dates}</span>
              </div>
              <ul className="flex flex-col gap-1.5">
                {e.bullets.map((b) => (
                  <Bullet key={b.sourceBulletId} bullet={b} ledgerTech={ledgerTech} />
                ))}
              </ul>
              <Dropped dropped={e.dropped} />
            </div>
          ))}
        </div>
      </Section>

      {r.projects.length > 0 ? (
        <Section label="Projects">
          <div className="flex flex-col gap-4">
            {r.projects.map((p) => (
              <div key={p.id} className="flex flex-col gap-1.5">
                <p className="font-body text-sm font-semibold text-text-primary">
                  {p.name} <span className="font-normal text-text-muted">· {p.meta}</span>
                </p>
                <ul className="flex flex-col gap-1.5">
                  {p.bullets.map((b) => (
                    <Bullet key={b.sourceBulletId} bullet={b} ledgerTech={ledgerTech} />
                  ))}
                </ul>
                <Dropped dropped={p.dropped} />
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {r.education.length > 0 ? (
        <Section label="Education">
          {r.education.map((ed) => (
            <p key={ed.degree} className="font-body text-xs text-text-secondary">
              <span className="font-semibold text-text-primary">{ed.degree}</span> — {ed.school}
            </p>
          ))}
        </Section>
      ) : null}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-mono text-2xs font-bold uppercase tracking-[0.15em] text-accent">
        {label}
      </h3>
      {children}
    </section>
  );
}

// One bullet: shows the tailored text (reworded words underlined green, original
// on hover), click to edit with a live subset-guard re-check.
function Bullet({
  bullet,
  ledgerTech,
  block,
}: {
  bullet: BulletDiff;
  ledgerTech: string[];
  block?: boolean;
}) {
  const [applied, setApplied] = useState(bullet.tailoredText);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(bullet.tailoredText);
  const [verdict, setVerdict] = useState<GuardResult>(bullet.verdict);
  const seq = useRef(0);

  useEffect(() => {
    if (!editing) return;
    const mine = ++seq.current;
    const id = setTimeout(() => {
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
        .catch(() => undefined);
    }, 350);
    return () => clearTimeout(id);
  }, [draft, editing, bullet, ledgerTech]);

  const changed = applied.trim() !== bullet.sourceText.trim();
  const Tag = block ? "div" : "li";

  if (editing) {
    return (
      <Tag className="flex flex-col gap-1.5">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          autoFocus
          className="w-full resize-y border border-border-strong bg-bg px-2 py-1.5 font-body text-xs text-text-primary focus:outline-none"
        />
        <div className="flex items-center gap-3">
          {verdict.faithful ? (
            <span className="font-mono text-2xs text-success">✓ grounded</span>
          ) : (
            <span className="font-mono text-2xs text-danger">
              ⚠ {verdict.flags.map((f) => f.token).join(", ")}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setApplied(draft);
              setEditing(false);
            }}
            className="ml-auto font-mono text-2xs uppercase tracking-wider text-accent hover:underline"
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
        </div>
        {!verdict.faithful ? (
          <p className="font-mono text-2xs leading-relaxed text-danger">
            {verdict.flags[0]?.message}
          </p>
        ) : null}
      </Tag>
    );
  }

  return (
    <Tag className="group flex gap-2 font-body text-xs leading-relaxed text-text-secondary">
      {block ? null : <span className="mt-0.5 shrink-0 text-accent">▹</span>}
      <span
        className="cursor-text"
        title={changed ? `original: ${bullet.sourceText}` : undefined}
        onClick={() => {
          setDraft(applied);
          setEditing(true);
        }}
      >
        {changed ? <Inline source={bullet.sourceText} tailored={applied} /> : applied}
        {changed ? (
          <span className="ml-1.5 align-middle font-mono text-[0.6rem] uppercase tracking-wider text-success opacity-0 transition-opacity group-hover:opacity-100">
            reworded ✓
          </span>
        ) : (
          <span className="ml-1.5 align-middle font-mono text-[0.6rem] uppercase tracking-wider text-text-muted opacity-0 transition-opacity group-hover:opacity-100">
            edit
          </span>
        )}
      </span>
    </Tag>
  );
}

// Tailored text with added words underlined; deletions rendered faint + struck.
function Inline({ source, tailored }: { source: string; tailored: string }) {
  return (
    <span>
      {wordDiff(source, tailored).map((p, i) => {
        if (p.type === "same") return <span key={i}>{p.value}</span>;
        if (p.type === "del")
          return (
            <span key={i} className="text-text-muted/50 line-through">
              {p.value}
            </span>
          );
        return (
          <span key={i} className="text-text-primary underline decoration-success/70 decoration-1">
            {p.value}
          </span>
        );
      })}
    </span>
  );
}

function Dropped({ dropped }: { dropped: BulletDiff[] }) {
  const [open, setOpen] = useState(false);
  if (dropped.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-fit font-mono text-2xs text-text-muted underline-offset-4 hover:text-accent hover:underline"
      >
        {open ? "hide dropped" : `+${dropped.length} less-relevant, hidden`}
      </button>
      {open
        ? dropped.map((b) => (
            <p
              key={b.sourceBulletId}
              className="flex gap-2 font-body text-xs leading-relaxed text-text-muted line-through decoration-text-muted/30"
            >
              <span className="mt-0.5 shrink-0">▹</span>
              <span>{b.sourceText}</span>
            </p>
          ))
        : null}
    </div>
  );
}
