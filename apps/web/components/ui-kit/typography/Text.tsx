import { cn } from "@/lib/utils";

export function Body({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        "font-body text-base leading-[1.6] text-text-primary",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function Small({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn("font-body text-[13px] text-text-secondary", className)}
    >
      {children}
    </p>
  );
}

export function Mono({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "font-mono text-[13px] tracking-wide text-text-secondary",
        className,
      )}
    >
      {children}
    </span>
  );
}
