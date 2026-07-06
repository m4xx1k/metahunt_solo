"use client";

import { toast } from "sonner";

import { useAnalytics } from "@/lib/hooks/use-analytics";

import { useFeatureFlag } from "./use-feature-flag";

// Bait for not-yet-built AI helpers: a click captures demand and nudges toward
// the auth funnel. Cover letter is per-vacancy; tune CV is CV-level (no id).
const COMING_SOON = "Coming soon — log in with Telegram to get it first";
const btn =
  "border border-border-strong px-2 py-[2px] font-mono uppercase tracking-wider text-text-secondary transition-colors hover:border-accent hover:text-accent";

export function BaitButtons({ vacancyId }: { vacancyId: string }) {
  const on = useFeatureFlag("feedback-buttons");
  const analytics = useAnalytics();

  if (!on) return null;

  const bait = (feature: "cover_letter" | "tune_cv", id?: string) => {
    analytics.baitClick(feature, id);
    toast(COMING_SOON);
  };

  return (
    <div className="flex items-center gap-2">
      <button type="button" className={btn} onClick={() => bait("cover_letter", vacancyId)}>
        ⚡ cover letter
      </button>
      <button type="button" className={btn} onClick={() => bait("tune_cv")}>
        ✎ tune CV
      </button>
    </div>
  );
}
