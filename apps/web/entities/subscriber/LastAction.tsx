import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { activityTone, type ActivityTone } from "./last-action";

const TONE: Record<ActivityTone, string> = {
  fresh: "text-success",
  recent: "text-text-primary",
  stale: "text-text-muted",
  never: "text-text-muted",
};

// The subscriber's own newest action. "never" means we have events for them but
// none they caused — usually a chat that linked and then went quiet.
export function LastAction({ at }: { at: string | null }) {
  const tone = activityTone(at);
  return (
    <span className={cn("tabular-nums", TONE[tone])}>{at ? formatRelative(at) : "never"}</span>
  );
}
