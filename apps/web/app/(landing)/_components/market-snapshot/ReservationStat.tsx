type Props = {
  reservationTrueCount: number;
  total: number;
};

export function ReservationStat({ reservationTrueCount, total }: Props) {
  const share =
    total > 0 ? Math.round((reservationTrueCount / total) * 100) : 0;

  return (
    <div className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
        reservation
      </span>
      <div className="flex flex-1 items-baseline gap-3">
        <span className="font-display text-5xl font-bold leading-none text-text-primary">
          {share}%
        </span>
        <span className="font-body text-sm leading-tight text-text-secondary">
          з бронюванням
          <br />
          від мобілізації
        </span>
      </div>
    </div>
  );
}
