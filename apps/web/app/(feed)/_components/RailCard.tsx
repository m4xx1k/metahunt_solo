import type { ReactNode } from "react";

// The shape both rail cards share: an accent title, the list to pick from when
// there is one, then the one thing you can add. Subscriptions and CVs are the
// same kind of object to a reader, so they must not look like two inventions.
export function RailCard({
  title,
  meta,
  picker,
  action,
}: {
  title: string;
  meta?: ReactNode;
  picker?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col border border-border bg-bg-card">
      <p className="flex items-baseline justify-between gap-2 border-b border-border px-3 py-1.5 font-mono text-2xs font-bold uppercase tracking-wider text-accent">
        <span>{title}</span>
        {meta ? <span className="font-normal text-text-muted">{meta}</span> : null}
      </p>
      {picker ? (
        // Its own scroll: the rail scrolls too, and a long list must never push
        // the add control off the screen.
        <div className="max-h-44 overflow-y-auto overscroll-contain border-b border-border">
          {picker}
        </div>
      ) : null}
      {action ? <div className="flex flex-col gap-1.5 p-3">{action}</div> : null}
    </div>
  );
}
