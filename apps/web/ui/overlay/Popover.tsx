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
  children,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(
          "z-50 max-w-[min(24rem,90vw)] border border-border bg-bg-card p-4 font-mono text-xs normal-case tracking-normal text-text-secondary shadow-brut-sm outline-none",
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
