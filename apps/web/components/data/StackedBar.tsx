type Segment = {
  value: number;
  label: string;
  color: string;
};

type LaidOutSegment = Segment & {
  x: number;
  widthPct: number;
  showLabel: boolean;
};

type Props = {
  segments: Segment[];
  total?: number;
  showLabels?: boolean;
  height?: number;
  ariaLabel?: string;
  className?: string;
};

const MIN_LABEL_PCT = 4;

function layout(
  segments: Segment[],
  sum: number,
  showLabels: boolean,
): LaidOutSegment[] {
  const out: LaidOutSegment[] = [];
  let cursor = 0;
  for (const s of segments) {
    const widthPct = (s.value / sum) * 100;
    if (widthPct <= 0) continue;
    out.push({
      ...s,
      x: cursor,
      widthPct,
      showLabel: showLabels && widthPct >= MIN_LABEL_PCT,
    });
    cursor += widthPct;
  }
  return out;
}

export function StackedBar({
  segments,
  total,
  showLabels = true,
  height = 24,
  ariaLabel,
  className,
}: Props) {
  const sum = total ?? segments.reduce((acc, s) => acc + s.value, 0);
  if (sum <= 0) return null;

  const laidOut = layout(segments, sum, showLabels);

  // Rectangles render in SVG (viewBox-stretched horizontally). Numeric labels
  // overlay as absolutely-positioned HTML so the font stays at native size
  // even though the SVG itself uses preserveAspectRatio="none".
  return (
    <div
      className={className}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      style={{ position: "relative", width: "100%", height }}
    >
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="block"
      >
        {laidOut.map((s, i) => (
          <rect
            key={`rect-${s.label}-${i}`}
            x={s.x}
            y={0}
            width={s.widthPct}
            height={height}
            fill={s.color}
          >
            <title>{`${s.label}: ${s.value}`}</title>
          </rect>
        ))}
      </svg>
      <div className="pointer-events-none absolute inset-0">
        {laidOut.map((s, i) =>
          s.showLabel ? (
            <span
              key={`label-${s.label}-${i}`}
              className="absolute top-0 flex h-full items-center justify-center font-mono text-[11px] font-bold text-bg"
              style={{ left: `${s.x}%`, width: `${s.widthPct}%` }}
            >
              {s.value}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}
