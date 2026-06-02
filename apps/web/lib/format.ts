export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const abs = Math.abs(diff);
  const sec = Math.round(abs / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);
  const sign = diff >= 0 ? "ago" : "from now";
  if (sec < 45) return `${sec}s ${sign}`;
  if (min < 60) return `${min}m ${sign}`;
  if (hr < 24) return `${hr}h ${sign}`;
  if (day < 30) return `${day}d ${sign}`;
  return formatDateTime(iso);
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const min = Math.floor(sec / 60);
  const restSec = Math.round(sec - min * 60);
  return `${min}m ${restSec}s`;
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

export function formatPercent(num: number, den: number): string {
  if (den <= 0) return "0%";
  const pct = Math.round((num / den) * 100);
  return `${pct}%`;
}

export function formatUsd(amount: number | null | undefined): string {
  if (amount == null) return "—";
  if (amount === 0) return "$0";
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  if (amount < 1) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(2)}`;
}

export function formatTokens(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

// Date-only (YYYY-MM-DD), and a collapsing range that shows a single date
// when both ends fall on the same day.
export function formatDateOnly(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export function formatDateRange(firstIso: string, lastIso: string): string {
  const first = formatDateOnly(firstIso);
  const last = formatDateOnly(lastIso);
  return first === last ? first : `${first} → ${last}`;
}

// Salary band where either bound may be missing: "min-max c" / "від min c"
// / "до max c" / "—".
export function formatSalaryRange({
  min,
  max,
  currency,
}: {
  min: number | null;
  max: number | null;
  currency: string | null;
}): string {
  const c = currency ?? "";
  if (min !== null && max !== null) return `${min}-${max} ${c}`.trim();
  if (min !== null) return `від ${min} ${c}`.trim();
  if (max !== null) return `до ${max} ${c}`.trim();
  return "—";
}

// Ukrainian plural selection (one / few / many) for a count.
export function pluralizeUa(
  n: number,
  one: string,
  few: string,
  many: string,
): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
