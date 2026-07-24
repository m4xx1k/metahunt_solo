"use client";

import { useCallback, useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useUrlState } from "../_hooks/use-url-state";

const MOBILE_MEDIA_QUERY = "(max-width: 1023px)";

type Props = {
  selected: string | undefined;
  children: ReactNode;
};

// Switches the detail panel between an inline sticky aside (lg+) and a
// bottom-sheet drawer (<lg). Drawer open-state is driven by the `selected`
// URL param — closing the sheet just clears it. Server Component children
// are rendered once and styled via responsive Tailwind utilities; effects
// (scroll-lock, Escape) only attach on mobile sizes when actually open.
export function DetailPanelShell({ selected, children }: Props) {
  const { update } = useUrlState();

  const handleClose = useCallback(() => {
    update({ selected: null });
  }, [update]);

  useEffect(() => {
    if (!selected || typeof window === "undefined") return;
    const mq = window.matchMedia(MOBILE_MEDIA_QUERY);
    if (!mq.matches) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [selected]);

  useEffect(() => {
    if (!selected || typeof window === "undefined") return;
    const mq = window.matchMedia(MOBILE_MEDIA_QUERY);
    if (!mq.matches) return;

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selected, handleClose]);

  return (
    <>
      {selected ? (
        <button
          type="button"
          aria-label="close panel"
          onClick={handleClose}
          className="fixed inset-0 z-40 bg-black/60 animate-overlay-in lg:hidden"
        />
      ) : null}

      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto bg-bg max-lg:animate-sheet-up lg:sticky lg:inset-x-auto lg:bottom-auto lg:top-4 lg:z-auto lg:max-h-none lg:overflow-visible lg:self-start lg:bg-transparent",
          selected ? "" : "hidden lg:block",
        )}
      >
        {selected ? (
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-bg-elev px-4 py-2 font-mono text-2xs uppercase tracking-wider text-text-muted lg:hidden">
            <span>dictionary entry</span>
            <button
              type="button"
              onClick={handleClose}
              aria-label="close panel"
              className="px-3 py-1 text-text-muted hover:text-text-primary"
            >
              close ✕
            </button>
          </div>
        ) : null}
        {children}
      </div>
    </>
  );
}
