import { cn } from "@/lib/utils";

// The dashed "real-world footnote" box (proto's .real) — a small aside that
// grounds a stage's claims without competing with the main copy.
export function Callout({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "border border-dashed border-border-strong bg-bg-elev px-4 py-3 font-body text-xs leading-[1.6] text-text-secondary",
        className,
      )}
    >
      {children}
    </div>
  );
}
