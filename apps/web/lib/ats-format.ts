import type { AtsJob } from "@/lib/api/ats";

const HOURS_PER_MONTH = 168;

function compact(n: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
    n,
  );
}

function range(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null && min !== max) return `${compact(min)}–${compact(max)}`;
  return compact(max ?? min ?? 0);
}

/**
 * ATS salaries are stored in the corpus's monthly convention. `salaryPeriod`
 * preserves what the employer actually quoted, so this presentation reverses
 * that normalisation before adding the correct label. A $120k/year board salary
 * can therefore never be rendered as "$10k/month" without disclosure.
 */
export function formatAtsSalary(
  job: Pick<AtsJob, "salaryMin" | "salaryMax" | "currency" | "salaryPeriod">,
): string | null {
  const multiplier =
    job.salaryPeriod === "YEAR" ? 12 : job.salaryPeriod === "HOUR" ? 1 / HOURS_PER_MONTH : 1;
  const amount = range(
    job.salaryMin == null ? null : Math.round(job.salaryMin * multiplier),
    job.salaryMax == null ? null : Math.round(job.salaryMax * multiplier),
  );
  if (!amount) return null;
  const currency = job.currency ? ` ${job.currency}` : "";
  const suffix =
    job.salaryPeriod === "YEAR"
      ? " / year"
      : job.salaryPeriod === "MONTH"
        ? " / month"
        : job.salaryPeriod === "HOUR"
          ? " / hour"
          : "";
  return `${amount}${currency}${suffix}`;
}

export function formatAtsLocations(locations: unknown, max = 2): string | null {
  if (!Array.isArray(locations)) return null;
  const values = locations
    .map((value) => {
      if (typeof value === "string") return value.trim();
      if (value && typeof value === "object" && "city" in value) {
        const city = (value as { city?: unknown }).city;
        return typeof city === "string" ? city.trim() : "";
      }
      return "";
    })
    .filter(Boolean);
  if (values.length === 0) return null;
  const head = values.slice(0, max).join(" · ");
  return values.length > max ? `${head} +${values.length - max}` : head;
}

export function formatAtsDate(iso: string | null): string {
  if (!iso || Number.isNaN(new Date(iso).getTime())) return "date unknown";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}
