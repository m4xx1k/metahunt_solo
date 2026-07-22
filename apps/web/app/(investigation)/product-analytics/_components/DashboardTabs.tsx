"use client";

import type { ReactNode } from "react";
import { Tabs as TabsPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

// Groups the dashboard's sections (funnel, subscribers, identity, journeys)
// behind one accessible tablist instead of an endless scroll — same visual
// language as (feed)/_components/LensTabs, built on radix-ui's Tabs (already
// a dependency via ui/overlay/Tooltip) for roving-tabindex/keyboard nav for free.
export type DashboardTabItem = {
  value: string;
  label: string;
};

export function DashboardTabs({
  items,
  defaultValue,
  children,
}: {
  items: DashboardTabItem[];
  defaultValue: string;
  children: ReactNode;
}) {
  return (
    <TabsPrimitive.Root defaultValue={defaultValue} className="flex flex-col gap-6">
      <TabsPrimitive.List
        aria-label="розділи дашборду"
        className="flex flex-wrap items-stretch self-start border border-border font-mono text-2xs uppercase tracking-wider"
      >
        {items.map((item) => (
          <TabsPrimitive.Trigger
            key={item.value}
            value={item.value}
            className={cn(
              "border-r border-border px-4 py-2 text-text-secondary transition-colors last:border-r-0 hover:text-accent",
              "data-[state=active]:bg-accent-subtle-bg data-[state=active]:font-bold data-[state=active]:text-accent data-[state=active]:shadow-[inset_0_-2px_0_0_var(--color-accent)]",
              "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
            )}
          >
            {item.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {children}
    </TabsPrimitive.Root>
  );
}

export function DashboardTabPanel({ value, children }: { value: string; children: ReactNode }) {
  return (
    <TabsPrimitive.Content value={value} className="flex flex-col gap-6 focus-visible:outline-none">
      {children}
    </TabsPrimitive.Content>
  );
}
