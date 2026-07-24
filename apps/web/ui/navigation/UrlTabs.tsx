"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Tabs as TabsPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

export type UrlTab = { value: string; label: string; badge?: ReactNode };

type TabsContextValue = { tabs: UrlTab[] };
const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(component: string): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error(`<${component}> must be rendered inside <UrlTabs>`);
  return ctx;
}

// Tabs whose selection lives in the query string (?tab=…), so a screen is
// deep-linkable and survives reload without a server round-trip: the switch is
// committed with history.replaceState, which Next 16 syncs into
// useSearchParams — that param is the only source of truth here. Root wraps the
// whole screen so <UrlTabsList> can sit in the sticky PageHeader while the
// panels live in the body.
export function UrlTabs({
  tabs,
  param = "tab",
  children,
}: {
  tabs: UrlTab[];
  param?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fallback = tabs[0]?.value ?? "";
  const requested = searchParams.get(param);
  const active = tabs.some((tab) => tab.value === requested) ? requested! : fallback;

  const onValueChange = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === fallback) params.delete(param);
      else params.set(param, next);
      const qs = params.toString();
      window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
    },
    [fallback, param, pathname, searchParams],
  );

  return (
    <TabsContext.Provider value={{ tabs }}>
      <TabsPrimitive.Root
        value={active}
        onValueChange={onValueChange}
        className="flex flex-1 flex-col"
      >
        {children}
      </TabsPrimitive.Root>
    </TabsContext.Provider>
  );
}

export function UrlTabsList({ label }: { label: string }) {
  const { tabs } = useTabsContext("UrlTabsList");
  return (
    <TabsPrimitive.List
      aria-label={label}
      className="-mb-px flex flex-wrap items-stretch gap-1 font-mono text-xs"
    >
      {tabs.map((tab) => (
        <TabsPrimitive.Trigger
          key={tab.value}
          value={tab.value}
          className={cn(
            "flex items-center gap-2 border-b-2 border-transparent px-3 pb-3 pt-1 text-text-muted transition-colors",
            "hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
            "data-[state=active]:border-accent data-[state=active]:text-text-primary",
          )}
        >
          {tab.label}
          {tab.badge ? <span className="text-2xs text-text-muted">{tab.badge}</span> : null}
        </TabsPrimitive.Trigger>
      ))}
    </TabsPrimitive.List>
  );
}

export function UrlTabPanel({ value, children }: { value: string; children: ReactNode }) {
  return (
    <TabsPrimitive.Content value={value} className="flex flex-col gap-6 focus-visible:outline-none">
      {children}
    </TabsPrimitive.Content>
  );
}
