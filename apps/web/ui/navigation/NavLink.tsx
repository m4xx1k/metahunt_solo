import Link from "next/link";
import { cn } from "@/lib/utils";

export function NavLink({
  href = "#",
  active,
  children,
  className,
}: {
  href?: string;
  active?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "font-display text-base transition-colors",
        active
          ? "text-accent font-bold"
          : "text-text-secondary font-medium hover:text-text-primary",
        className,
      )}
    >
      {children}
    </Link>
  );
}
