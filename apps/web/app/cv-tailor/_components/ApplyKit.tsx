"use client";

import type { ApplyKitResult } from "@/lib/api/cv-tailor";

type Props = { data: ApplyKitResult | null; loading: boolean; error: string | null };

export function CoverLetter({ data, loading, error }: Props) {
  if (loading) return <Loading label="drafting your cover letter…" />;
  if (error) return <ErrorLine error={error} />;
  if (!data) return null;
  const { coverLetter } = data;
  return (
    <div className="flex flex-col gap-4 border border-border-strong bg-bg-elev px-7 py-6 shadow-brut">
      <p className="whitespace-pre-line font-body text-sm leading-relaxed text-text-primary">
        {coverLetter.text}
      </p>
      {coverLetter.flags.length === 0 ? (
        <p className="border-t border-border pt-3 font-mono text-2xs uppercase tracking-wider text-success">
          ✓ grounded — every claim traces to your CV
        </p>
      ) : (
        <ul className="flex flex-col gap-1 border-t border-border pt-3">
          {coverLetter.flags.map((f, i) => (
            <li key={i} className="font-mono text-2xs text-danger">
              ⚠ {f.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Interview({ data, loading, error }: Props) {
  if (loading) return <Loading label="prepping likely questions…" />;
  if (error) return <ErrorLine error={error} />;
  if (!data) return null;
  return (
    <div className="flex flex-col gap-3">
      {data.interview.map((q, i) => (
        <div
          key={i}
          className="flex flex-col gap-2 border border-border bg-bg-card px-5 py-4 shadow-brut-sm"
        >
          <p className="font-body text-sm font-semibold text-text-primary">{q.question}</p>
          <p className="font-mono text-2xs uppercase tracking-wider text-text-muted">{q.angle}</p>
          {q.evidence ? (
            <p className="border-l-2 border-accent pl-3 font-body text-xs leading-relaxed text-text-secondary">
              {q.evidence}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return <p className="font-mono text-xs text-text-muted">{label}</p>;
}

function ErrorLine({ error }: { error: string }) {
  return <p className="font-mono text-xs text-danger">{error}</p>;
}
