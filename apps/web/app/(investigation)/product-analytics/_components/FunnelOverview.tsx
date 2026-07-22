import type { ProductFunnelStep } from "@/lib/api/product-analytics";
import { StackedBar } from "@/ui/charts/StackedBar";

// Funnel steps are a magnitude, not an identity — one hue (accent), ramped
// light-to-dark left-to-right so earlier/bigger stages read brighter and
// later/smaller ones fade, instead of 9 unrelated categorical colors.
function segmentsFor(funnel: ProductFunnelStep[], labels: Record<string, string>) {
  const n = funnel.length;
  return funnel.map((step, i) => {
    const t = n > 1 ? i / (n - 1) : 0;
    const mix = Math.round(100 - t * 70);
    return {
      value: step.journeys,
      label: labels[step.name] ?? step.name,
      color: `color-mix(in srgb, var(--color-accent) ${mix}%, var(--color-bg-card))`,
    };
  });
}

export function FunnelOverview({
  funnel,
  labels,
}: {
  funnel: ProductFunnelStep[];
  labels: Record<string, string>;
}) {
  const total = funnel.reduce((sum, step) => sum + step.journeys, 0);
  if (total <= 0) {
    return (
      <p className="font-mono text-xs text-text-muted">
        для цього періоду ще немає journey — нема чого показувати.
      </p>
    );
  }

  const first = funnel[0];
  const last = funnel.at(-1);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3 font-mono text-2xs uppercase tracking-wider text-text-muted">
        <span>
          {labels[first.name] ?? first.name} · {first.journeys}
        </span>
        <span>обсяг на етапі, ліворуч → праворуч за часом</span>
        {last ? (
          <span>
            {labels[last.name] ?? last.name} · {last.journeys}
          </span>
        ) : null}
      </div>
      <StackedBar
        segments={segmentsFor(funnel, labels)}
        total={total}
        height={28}
        ariaLabel="обсяг journey на кожному етапі воронки, в хронологічному порядку"
      />
    </div>
  );
}
