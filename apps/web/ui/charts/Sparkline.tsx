type Props = {
  points: number[];
  width?: number;
  height?: number;
  stroke?: string;
  ariaLabel?: string;
  className?: string;
};

export function Sparkline({
  points,
  width = 120,
  height = 24,
  stroke,
  ariaLabel,
  className,
}: Props) {
  if (!points || points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const stepX = width / (points.length - 1);
  const coords = points
    .map((p, i) => {
      const x = i * stepX;
      const y = height - ((p - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      className={className}
    >
      <polyline
        fill="none"
        stroke={stroke ?? "var(--color-accent)"}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={coords}
      />
    </svg>
  );
}
