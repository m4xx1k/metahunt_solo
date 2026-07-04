"use client";

// Shared dashed-border upload CTA styling — the "drop your CV here" affordance.
export const UPLOAD_BTN =
  "inline-flex shrink-0 items-center justify-center gap-1.5 border border-dashed border-accent px-3.5 py-2 font-mono text-2xs font-bold uppercase tracking-wider text-accent transition-colors hover:bg-accent-subtle-bg disabled:cursor-not-allowed disabled:opacity-60";

// The upload button. Drag-and-drop is handled by the surrounding control bar and
// the file input lives in <MergedShell>; this just triggers the picker.
export function CvDropzone({
  onClick,
  busy = false,
}: {
  onClick: () => void;
  busy?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={busy} className={UPLOAD_BTN}>
      {busy ? "Reading…" : "+ Upload CV"}
    </button>
  );
}
