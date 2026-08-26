import { Fact } from "@/entities/vacancy/Fact";
import { cn } from "@/lib/utils";

export type Spec = { label: string; value: string };

/**
 * One DOM tree, two shapes: a boxed 2-up/3-up grid while the page is a single
 * column, a single bordered spec sheet once it becomes the left rail at lg.
 * Rendering it twice behind `hidden` would double the crawlable text on ~4.9k
 * pages, so the reflow is done in CSS.
 */
export function VacancySpecRail({ specs, className }: { specs: Spec[]; className?: string }) {
  if (specs.length === 0) return null;

  return (
    <div className={className}>
      <div
        className={cn(
          "grid grid-cols-2 gap-3 sm:grid-cols-3",
          "lg:grid-cols-1 lg:gap-0 lg:divide-y lg:divide-border lg:border lg:border-border lg:bg-bg-card",
        )}
      >
        {specs.map((s) => (
          <div key={s.label} className="border border-border bg-bg-card p-4 lg:border-0">
            <Fact label={s.label} value={s.value} />
          </div>
        ))}
      </div>
    </div>
  );
}
