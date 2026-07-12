"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import Link from "next/link";

import type { BulletDiff, SkillGroup, TailorResult, TailoredResume } from "@/lib/api/cv-tailor";

// Standalone "Save as PDF" view. The workbench stashes the current TailorResult in
// localStorage (shared across tabs) and opens this route; we render a clean, print-
// safe document (no app chrome) and open the browser print dialog. Style variants
// are just CSS themes — zero PDF dependency. See md/journal/migrations/cv-cover-letter.md.

const PRINT_KEY = "metahunt.cv-print";

type Mode = "tailored" | "original";
type Variant = "classic" | "modern" | "compact";

interface Payload {
  result: TailorResult;
  mode: Mode;
}

const VARIANTS: Record<Variant, { font: string; accent: string; scale: number; label: string }> = {
  classic: {
    font: "Georgia, 'Times New Roman', serif",
    accent: "#111827",
    scale: 1,
    label: "Classic",
  },
  modern: {
    font: "'Helvetica Neue', Arial, sans-serif",
    accent: "#2563eb",
    scale: 1,
    label: "Modern",
  },
  compact: {
    font: "'Helvetica Neue', Arial, sans-serif",
    accent: "#111827",
    scale: 0.9,
    label: "Compact",
  },
};

function bulletText(b: BulletDiff, mode: Mode): string {
  return mode === "original" ? b.sourceText : b.tailoredText;
}

function visibleSkills(skills: SkillGroup[], mode: Mode): SkillGroup[] {
  return mode === "original" ? skills.filter((g) => !g.added) : skills;
}

const NOOP_SUBSCRIBE = () => () => {};

// Read the stashed payload as external state — SSR-safe and no setState-in-effect.
// getServerSnapshot returns undefined, so the first paint renders nothing (not the
// "missing" message) until the client has actually read localStorage.
function readRaw(): string | null {
  try {
    return window.localStorage.getItem(PRINT_KEY);
  } catch {
    return null;
  }
}

export default function PrintPage() {
  const raw = useSyncExternalStore<string | null | undefined>(
    NOOP_SUBSCRIBE,
    readRaw,
    () => undefined,
  );
  const [variant, setVariant] = useState<Variant>("classic");
  const printed = useRef(false);

  const payload = useMemo<Payload | null>(() => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Payload;
    } catch {
      return null;
    }
  }, [raw]);

  // Auto-open the print dialog once, after the document has rendered.
  useEffect(() => {
    if (!payload || printed.current) return;
    printed.current = true;
    const id = setTimeout(() => window.print(), 500);
    return () => clearTimeout(id);
  }, [payload]);

  if (raw === undefined) return null; // SSR / pre-hydration
  if (!payload) {
    return (
      <main style={{ padding: 48, fontFamily: "system-ui, sans-serif", color: "#111" }}>
        <p>Nothing to print.</p>
        <p style={{ marginTop: 8, color: "#555" }}>
          Open <Link href="/cv-tailor">/cv-tailor</Link>, tailor a CV, then click “Download PDF”.
        </p>
      </main>
    );
  }

  const resume = payload.result.resume;
  const theme = VARIANTS[variant];

  return (
    <div style={{ background: "#f3f4f6", minHeight: "100vh" }}>
      <style>{PRINT_CSS}</style>

      {/* Controls — hidden in the printed output */}
      <div className="no-print" style={controlsStyle}>
        <button onClick={() => window.print()} style={printBtnStyle}>
          Save as PDF
        </button>
        <span style={{ fontSize: 12, color: "#6b7280", marginRight: 4 }}>style:</span>
        {(Object.keys(VARIANTS) as Variant[]).map((v) => (
          <button
            key={v}
            onClick={() => setVariant(v)}
            style={{
              ...variantBtnStyle,
              background: v === variant ? "#111827" : "#fff",
              color: v === variant ? "#fff" : "#374151",
            }}
          >
            {VARIANTS[v].label}
          </button>
        ))}
        <span style={{ fontSize: 12, color: "#6b7280", marginLeft: "auto" }}>
          {payload.mode === "original" ? "original (verbatim)" : "tailored"}
        </span>
      </div>

      <div className="page" style={{ fontFamily: theme.font }}>
        <ResumeDoc resume={resume} mode={payload.mode} theme={theme} />
      </div>
    </div>
  );
}

function ResumeDoc({
  resume,
  mode,
  theme,
}: {
  resume: TailoredResume;
  mode: Mode;
  theme: { accent: string; scale: number };
}) {
  const s = theme.scale;
  const contacts = [
    resume.contacts.location,
    resume.contacts.email,
    resume.contacts.phone,
    resume.contacts.github,
    resume.contacts.linkedin,
    resume.contacts.telegram,
  ].filter(Boolean);

  const heading = (label: string) => (
    <h2
      style={{
        fontSize: 11 * s,
        letterSpacing: 1.5,
        textTransform: "uppercase",
        color: theme.accent,
        borderBottom: `1px solid ${theme.accent}`,
        paddingBottom: 3,
        margin: `${16 * s}px 0 ${8 * s}px`,
      }}
    >
      {label}
    </h2>
  );

  return (
    <article style={{ color: "#111827", fontSize: 13 * s, lineHeight: 1.5 }}>
      <header style={{ textAlign: "center", marginBottom: 6 }}>
        <h1 style={{ fontSize: 24 * s, margin: 0, color: theme.accent }}>{resume.name}</h1>
        <p style={{ fontSize: 14 * s, margin: "2px 0", fontWeight: 600 }}>{resume.title}</p>
        <p style={{ fontSize: 11 * s, color: "#4b5563", margin: 0 }}>{contacts.join("  ·  ")}</p>
      </header>

      {heading("Summary")}
      <p style={{ margin: 0 }}>{bulletText(resume.summary, mode)}</p>

      {heading("Skills")}
      <div>
        {visibleSkills(resume.skills, mode).map((g) => (
          <p key={g.group} style={{ margin: "0 0 3px" }}>
            <strong style={{ color: g.added ? "#b91c1c" : "#111827" }}>{g.group}</strong>
            {g.added ? <em style={{ color: "#b91c1c", fontSize: 10 * s }}> (verify) </em> : " — "}
            {g.items.join(" · ")}
          </p>
        ))}
      </div>

      {heading("Experience")}
      {resume.experience.map((e) => (
        <div key={e.id} style={{ marginBottom: 10 * s, breakInside: "avoid" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <strong>
              {e.role} · {e.org}
            </strong>
            <span style={{ color: "#6b7280", fontSize: 11 * s, whiteSpace: "nowrap" }}>
              {e.dates}
            </span>
          </div>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {e.bullets.map((b) => (
              <li key={b.sourceBulletId} style={{ marginBottom: 2 }}>
                {bulletText(b, mode)}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {resume.projects.length > 0 ? (
        <>
          {heading("Projects")}
          {resume.projects.map((p) => (
            <div key={p.id} style={{ marginBottom: 10 * s, breakInside: "avoid" }}>
              <strong>{p.name}</strong>
              {p.meta ? <span style={{ color: "#6b7280" }}> · {p.meta}</span> : null}
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                {p.bullets.map((b) => (
                  <li key={b.sourceBulletId} style={{ marginBottom: 2 }}>
                    {bulletText(b, mode)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      ) : null}

      {resume.education.length > 0 ? (
        <>
          {heading("Education")}
          {resume.education.map((ed) => (
            <p key={ed.degree} style={{ margin: "0 0 3px" }}>
              <strong>{ed.degree}</strong> — {ed.school}
              {ed.dates ? <span style={{ color: "#6b7280" }}> · {ed.dates}</span> : null}
            </p>
          ))}
        </>
      ) : null}
    </article>
  );
}

const controlsStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 16px",
  background: "#fff",
  borderBottom: "1px solid #e5e7eb",
  flexWrap: "wrap",
};
const printBtnStyle: CSSProperties = {
  padding: "6px 14px",
  background: "#2563eb",
  color: "#fff",
  border: "none",
  borderRadius: 4,
  fontSize: 13,
  cursor: "pointer",
  marginRight: 8,
};
const variantBtnStyle: CSSProperties = {
  padding: "5px 10px",
  border: "1px solid #d1d5db",
  borderRadius: 4,
  fontSize: 12,
  cursor: "pointer",
};

const PRINT_CSS = `
  .page {
    max-width: 780px;
    margin: 24px auto;
    background: #fff;
    padding: 40px 48px;
    box-shadow: 0 1px 8px rgba(0,0,0,0.12);
  }
  @page { margin: 14mm; }
  @media print {
    .no-print { display: none !important; }
    body, html { background: #fff !important; }
    .page { margin: 0; max-width: none; box-shadow: none; padding: 0; }
  }
`;
