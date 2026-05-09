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

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      className={className}
    >
      {laidOut.map((s, i) => (
        <g key={`${s.label}-${i}`}>
          <rect
            x={s.x}
            y={0}
            width={s.widthPct}
            height={height}
            fill={s.color}
          >
            <title>{`${s.label}: ${s.value}`}</title>
          </rect>
          {s.showLabel ? (
            <text
              x={s.x + s.widthPct / 2}
              y={height / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fill="var(--color-bg)"
              fontSize={11}
              fontFamily="var(--font-mono)"
            >
              {s.value}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  );
}
