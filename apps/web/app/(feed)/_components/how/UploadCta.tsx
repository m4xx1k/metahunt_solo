"use client";

// Opens the CV picker via a window event (the upload input lives in
// FeedLensShell, a sibling island) instead of navigating.
export function UploadCta({ label, event }: { label: string; event: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(event))}
      className="inline-flex items-center justify-center gap-2 border border-dashed border-accent px-5 py-3 font-body text-sm font-semibold text-accent transition-colors hover:bg-accent-subtle-bg"
    >
      {label}
      <span aria-hidden>{"=>"}</span>
    </button>
  );
}
