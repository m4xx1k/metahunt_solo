"use client";

import type { TailorResult } from "@/lib/api/cv-tailor";

// The tailored one-pager as it would render — the selected, reordered bullets
// (verbatim / verified-rephrase). This is the "final look" beside the diff.
export function ResumePreview({ result }: { result: TailorResult }) {
  const r = result.resume;
  const contacts = [
    r.contacts.location,
    r.contacts.email,
    r.contacts.github,
    r.contacts.linkedin,
    r.contacts.telegram,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-2xs uppercase tracking-wider text-text-muted">
          tailored one-pager
        </span>
        <span className="font-mono text-2xs uppercase tracking-wider text-success">live</span>
      </div>

      <div className="flex flex-col gap-5 border border-border-strong bg-bg-elev p-6 shadow-brut">
        <div className="flex flex-col gap-1 border-b border-border pb-3">
          <h3 className="font-display text-xl font-bold text-text-primary">{r.name}</h3>
          <p className="font-body text-sm text-accent">{r.title}</p>
          <p className="font-mono text-2xs leading-relaxed text-text-muted">
            {contacts.join("  ·  ")}
          </p>
        </div>

        <PreviewSection label="Summary">
          <p className="font-body text-xs leading-relaxed text-text-secondary">
            {r.summary.tailoredText}
          </p>
        </PreviewSection>

        <PreviewSection label="Skills">
          <div className="flex flex-col gap-1">
            {r.skills.map((g) => (
              <p key={g.group} className="font-body text-xs leading-relaxed text-text-secondary">
                <span className="font-semibold text-text-primary">{g.group}</span> —{" "}
                {g.items.join(" · ")}
              </p>
            ))}
          </div>
        </PreviewSection>

        <PreviewSection label="Experience">
          <div className="flex flex-col gap-3">
            {r.experience.map((e) => (
              <div key={e.id} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-body text-xs font-semibold text-text-primary">
                    {e.role} · {e.org}
                  </p>
                  <span className="shrink-0 font-mono text-2xs text-text-muted">{e.dates}</span>
                </div>
                <ul className="flex flex-col gap-1">
                  {e.bullets.map((b) => (
                    <li
                      key={b.sourceBulletId}
                      className="flex gap-2 font-body text-xs leading-relaxed text-text-secondary"
                    >
                      <span className="text-accent">▹</span>
                      <span>{b.tailoredText}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </PreviewSection>

        {r.projects.length > 0 ? (
          <PreviewSection label="Projects">
            <div className="flex flex-col gap-3">
              {r.projects.map((p) => (
                <div key={p.id} className="flex flex-col gap-1">
                  <p className="font-body text-xs font-semibold text-text-primary">
                    {p.name} <span className="font-normal text-text-muted">· {p.meta}</span>
                  </p>
                  <ul className="flex flex-col gap-1">
                    {p.bullets.map((b) => (
                      <li
                        key={b.sourceBulletId}
                        className="flex gap-2 font-body text-xs leading-relaxed text-text-secondary"
                      >
                        <span className="text-accent">▹</span>
                        <span>{b.tailoredText}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </PreviewSection>
        ) : null}

        {r.education.length > 0 ? (
          <PreviewSection label="Education">
            {r.education.map((ed) => (
              <p key={ed.degree} className="font-body text-xs text-text-secondary">
                <span className="font-semibold text-text-primary">{ed.degree}</span> — {ed.school}
              </p>
            ))}
          </PreviewSection>
        ) : null}
      </div>

      <p className="font-mono text-2xs leading-relaxed text-text-muted">
        PDF export (Typst, three styles) is the next step — v1 proves the tailoring and the
        guarantee first.
      </p>
    </div>
  );
}

function PreviewSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h4 className="font-mono text-2xs font-bold uppercase tracking-[0.15em] text-accent">
        {label}
      </h4>
      {children}
    </section>
  );
}
