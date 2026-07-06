"use client";

import { toast } from "sonner";

import { useAnalytics } from "@/lib/hooks/use-analytics";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/overlay/Tooltip";

import { useFeatureFlag } from "./use-feature-flag";

// Bait for not-yet-built AI helpers: a click captures demand and nudges toward
// the auth funnel. Cover letter is per-vacancy; tune CV is CV-level (no id).
const COMING_SOON = "Coming soon — log in with Telegram to get it first";
const btn =
  "border border-border-strong px-2 py-[2px] font-mono uppercase tracking-wider text-text-secondary transition-colors hover:border-accent hover:text-accent";

// One capture per (feature, vacancy) per page session — repeat taps still toast
// but don't re-count, so a rapid clicker can't inflate the demand signal. (A
// public analytics key can't be hard-rate-limited without a backend.)
const fired = new Set<string>();

export function BaitButtons({ vacancyId }: { vacancyId: string }) {
  const on = useFeatureFlag("feedback-buttons");
  const analytics = useAnalytics();

  if (!on) return null;

  const bait = (feature: "cover_letter" | "tune_cv", id?: string) => {
    const key = `${feature}:${id ?? ""}`;
    if (!fired.has(key)) {
      fired.add(key);
      analytics.baitClick(feature, id);
    }
    toast(COMING_SOON);
  };

  return (
    <div className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={btn}
            onClick={() => bait("cover_letter", vacancyId)}
          >
            ⚡ cover letter
          </button>
        </TooltipTrigger>
        <TooltipContent>Draft a cover letter for this role (coming soon)</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className={btn} onClick={() => bait("tune_cv")}>
            ✎ tune CV
          </button>
        </TooltipTrigger>
        <TooltipContent>Tailor your CV to this role&rsquo;s stack (coming soon)</TooltipContent>
      </Tooltip>
    </div>
  );
}
