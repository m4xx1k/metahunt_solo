import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const COLS: Record<2 | 3 | 4 | 5, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
  5: "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5",
};

export function StatGrid({
  cols = 4,
  children,
  className,
}: {
  cols?: 2 | 3 | 4 | 5;
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("grid auto-rows-fr gap-3", COLS[cols], className)}>{children}</div>;
}
