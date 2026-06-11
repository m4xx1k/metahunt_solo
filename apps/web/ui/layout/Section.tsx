import { cn } from "@/lib/utils";

export function Section({
  id,
  variant = "base",
  className,
  children,
}: {
  id?: string;
  variant?: "base" | "elevated";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn(
        "w-full px-6 py-24 md:px-20 md:py-[100px]",
        variant === "elevated" ? "bg-bg-elev" : "bg-bg",
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-[1280px] flex-col items-center gap-16">
        {children}
      </div>
    </section>
  );
}
