"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const ACCEPT = ".pdf,.txt,application/pdf,text/plain";

// The warm-lens unlock affordance: drop or pick a CV. PR1 wires the UI only;
// the `onFile` handler (upload → candidateId → warm) lands in PR2.
export function CvDropzone({
  onFile,
  busy = false,
}: {
  onFile: (file: File) => void;
  busy?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const pick = useCallback(() => inputRef.current?.click(), []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "flex items-center justify-between gap-3 border border-dashed px-4 py-3 transition-colors",
        dragging ? "border-accent bg-accent/5" : "border-border bg-bg-card",
      )}
    >
      <span className="font-mono text-2xs uppercase tracking-wider text-text-secondary">
        {busy ? "обробляю резюме…" : "завантаж резюме — побач свій фіт"}
      </span>
      <button
        type="button"
        onClick={pick}
        disabled={busy}
        className="border border-border px-3 py-1.5 font-mono text-2xs uppercase tracking-wider text-text-primary transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        обрати файл
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
