import { cn } from "@/lib/utils";

// One labelled fact (salary / english / experience / source / company).
// `highlight` is the success accent used for salary; `valueClass` fully
// overrides the default value styling (the feed card's aside facts);
// `children` replaces the value span for non-text facts (domain tag).
export function Fact({
  label,
  value,
  highlight,
  valueClass,
  children,
}: {
  label: string;
  value?: string;
  highlight?: boolean;
  valueClass?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-2xs uppercase tracking-wider text-text-muted">
        {label}
      </span>
      {children ?? (
        <span
          className={cn(
            "font-mono",
            highlight
              ? "text-success text-base font-bold"
              : (valueClass ?? "text-text-primary text-xs"),
          )}
        >
          {value}
        </span>
      )}
    </div>
  );
}
