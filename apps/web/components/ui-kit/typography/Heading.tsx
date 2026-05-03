import { cn } from "@/lib/utils";

type Level = "section" | "h1" | "h2" | "h3";

const styles: Record<Level, string> = {
  section:
    "font-display text-[56px] font-bold tracking-[-0.04em] leading-[1.1] text-text-primary",
  h1: "font-display text-[72px] font-black tracking-[-0.03em] leading-none text-text-primary",
  h2: "font-display text-[48px] font-bold tracking-[-0.02em] leading-[1.1] text-text-primary",
  h3: "font-display text-[32px] font-bold leading-[1.2] text-text-primary",
};

export function Heading({
  level = "h2",
  as,
  className,
  children,
}: {
  level?: Level;
  as?: "h1" | "h2" | "h3" | "h4";
  className?: string;
  children: React.ReactNode;
}) {
  const Tag = as ?? (level === "h1" ? "h1" : level === "h3" ? "h3" : "h2");
  return <Tag className={cn(styles[level], className)}>{children}</Tag>;
}
