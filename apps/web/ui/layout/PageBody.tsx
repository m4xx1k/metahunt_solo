import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// The one content column every console screen renders into, so gutters and
// max width never drift between pages.
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-5 py-6 md:px-8 md:py-8",
        className,
      )}
    >
      {children}
    </div>
  );
}
