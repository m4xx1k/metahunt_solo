import { fmt } from "../lib/graph";

const MAX_DIAMETER = 168;
const MIN_LABEL_DIAMETER = 60;

/** Magnitude by circle AREA, not length — diameter = maxDiameter * sqrt(value/max)
 *  so area stays proportional to value. Flex-wrap, not true circle-packing: with
 *  ~20 items the gaps read fine and it skips a layout algorithm for a sandbox
 *  chart. Big bubbles carry the label inside; small ones carry it underneath
 *  (never clipped, per the mark spec) — the count is always visible, never only
 *  in the hover title. */
export function BubbleChart({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="flex flex-wrap items-end justify-center gap-4 p-5">
      {items.map((item) => {
        const d = Math.max(20, MAX_DIAMETER * Math.sqrt(item.value / max));
        const inside = d >= MIN_LABEL_DIAMETER;
        return (
          <div key={item.label} className="flex flex-col items-center gap-1.5" title={`${item.label}: ${fmt(item.value)}`}>
            <div
              className="flex shrink-0 items-center justify-center rounded-full border border-signal bg-signal-soft text-center"
              style={{ width: d, height: d }}
            >
              {inside ? (
                <span className="px-1 leading-tight">
                  <span className="block truncate text-[0.72rem] text-ink-2" style={{ maxWidth: d - 12 }}>
                    {item.label}
                  </span>
                  <span className="block font-mono text-[0.78rem] font-semibold text-ink">{fmt(item.value)}</span>
                </span>
              ) : null}
            </div>
            {!inside ? (
              <span className="max-w-[6rem] truncate text-center text-[0.68rem] text-ink-3">
                {item.label} · {fmt(item.value)}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
