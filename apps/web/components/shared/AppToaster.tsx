"use client";

import { Toaster } from "sonner";

export function AppToaster() {
  return (
    <Toaster
      position="bottom-right"
      offset={16}
      duration={3500}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex items-center gap-3 w-full border bg-bg-card text-text-primary shadow-[4px_4px_0_0_#000] rounded-lg px-4 py-3 font-body text-sm",
          title: "font-body text-sm leading-snug",
          description: "font-body text-xs text-text-secondary",
          icon: "shrink-0",
          success: "border-accent",
          error: "border-danger",
          info: "border-border",
          warning: "border-accent-secondary",
          default: "border-border",
        },
      }}
    />
  );
}
