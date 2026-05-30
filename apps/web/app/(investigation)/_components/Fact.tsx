import { cn } from "@/lib/utils";

// One labelled fact (salary / english / experience) in the key-facts grid.
// Shared by the investigation vacancy cards.
export function Fact({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
        {label}
      </span>
      <span
        className={cn(
          "font-mono",
          highlight
            ? "text-success text-base font-bold"
            : "text-text-primary text-[13px]",
        )}
      >
        {value}
      </span>
    </div>
  );
}
