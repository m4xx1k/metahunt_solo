import { trackIntro } from "@/lib/seo/feed-meta";
import type { TrackDto } from "@/lib/api/tracks";

// Track pages were byte-identical to each other apart from the card list, which
// reads as one duplicated page to a crawler. This gives each its own prose.
export function TrackIntro({ track }: { track: Pick<TrackDto, "label" | "count"> }) {
  return (
    <p className="mx-auto w-full max-w-7xl px-6 pb-8 font-body text-sm leading-[1.65] text-text-secondary md:px-12 md:text-base">
      {trackIntro(track)}
    </p>
  );
}
