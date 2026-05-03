import { cn } from "@/lib/utils";

export function IconBox({
  label,
  className,
}: {
  label: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-16 w-16 items-center justify-center border border-border bg-bg-elev font-body text-2xl text-text-primary",
        className,
      )}
    >
      {label}
    </div>
  );
}
