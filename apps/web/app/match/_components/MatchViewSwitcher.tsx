"use client";

import { useState } from "react";
import { SparkleIcon, StepsIcon } from "@phosphor-icons/react/dist/ssr";

import { QuickSubscriptionCard } from "@/features/quick-flow";
import { cn } from "@/lib/utils";
import { MatchStepper } from "./MatchStepper";

export function MatchViewSwitcher() {
  const [view, setView] = useState<"quick" | "legacy">("quick");

  return (
    <div className="flex flex-col gap-6">
      {/* Switcher tabs */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-1 font-mono text-2xs uppercase tracking-wider text-text-muted">
          <span>Режим налаштування:</span>
        </div>
        <div className="flex items-center gap-1 bg-bg p-1 border border-border">
          <button
            type="button"
            onClick={() => setView("quick")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 font-mono text-xs transition-colors",
              view === "quick"
                ? "bg-accent text-bg font-bold shadow-brut-2xs"
                : "text-text-muted hover:text-text-primary",
            )}
          >
            <SparkleIcon className="h-3.5 w-3.5" weight={view === "quick" ? "fill" : "regular"} />
            <span>Швидкий радар (новий)</span>
          </button>
          <button
            type="button"
            onClick={() => setView("legacy")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 font-mono text-xs transition-colors",
              view === "legacy"
                ? "bg-accent text-bg font-bold shadow-brut-2xs"
                : "text-text-muted hover:text-text-primary",
            )}
          >
            <StepsIcon className="h-3.5 w-3.5" />
            <span>Покроковий візард</span>
          </button>
        </div>
      </div>

      {view === "quick" ? <QuickSubscriptionCard /> : <MatchStepper />}
    </div>
  );
}
