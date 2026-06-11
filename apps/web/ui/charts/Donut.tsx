type Props = {
  value: number;
  total: number;
  label?: string;
  size?: number;
  thickness?: number;
  stroke?: string;
  ariaLabel?: string;
  className?: string;
};

export function Donut({
  value,
  total,
  label,
  size = 96,
  thickness = 12,
  stroke,
  ariaLabel,
  className,
}: Props) {
  const safe = Math.max(0, Math.min(value, total));
  const pct = total > 0 ? safe / total : 0;
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  const dash = `${pct * circumference} ${circumference}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      className={className}
    >
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke="var(--color-border)"
        strokeWidth={thickness}
      />
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke={stroke ?? "var(--color-accent)"}
        strokeWidth={thickness}
        strokeDasharray={dash}
        strokeLinecap="butt"
        transform={`rotate(-90 ${c} ${c})`}
      />
      <text
        x={c}
        y={c}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={size * 0.22}
        fontFamily="var(--font-display)"
        fontWeight={700}
        fill="var(--color-text-primary)"
      >
        {label ?? String(safe)}
      </text>
    </svg>
  );
}
