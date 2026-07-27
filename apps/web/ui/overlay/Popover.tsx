"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

// shadcn/radix Popover, skinned to the neobrutalist tokens (hard border +
// shadow-brut, radius 0, mono) — sibling of ui/overlay/Tooltip. Use for a
// compact detail panel anchored to a trigger (e.g. an "N items" chip); for a
// full-height side panel use a dialog/drawer instead (see FailedIngestsDrawer).

function Popover(props: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root {...props} />;
}

function PopoverTrigger(props: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger {...props} />;
}

function PopoverContent({
  className,
  sideOffset = 6,
  align = "start",
  forceMount,
  children,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    // The Portal unmounts its subtree on close unless it is force-mounted too,
    // so passing forceMount only to Content silently does nothing.
    <PopoverPrimitive.Portal forceMount={forceMount}>
      <PopoverPrimitive.Content
        forceMount={forceMount}
        sideOffset={sideOffset}
        align={align}
        className={cn(
          "z-50 max-w-[min(24rem,90vw)] border border-border bg-bg-card p-4 font-mono text-xs normal-case tracking-normal text-text-secondary shadow-brut-sm outline-none",
          // Only bites when force-mounted; otherwise the content is already gone.
          "data-[state=closed]:hidden",
          className,
        )}
        {...props}
      >
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverTrigger, PopoverContent };
