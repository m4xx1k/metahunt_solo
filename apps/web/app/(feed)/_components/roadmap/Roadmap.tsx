import { Section, SectionHeader } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { roadmapItems, roadmapSection } from "./data";

export function Roadmap() {
  return (
    <Section id="roadmap" variant="elevated">
      <SectionHeader {...roadmapSection} />
      <div className="flex w-full flex-col md:flex-row">
        {roadmapItems.map((item, idx) => (
          <div
            key={item.title}
            className="group relative flex flex-1 flex-col gap-3.5 pr-0 md:pr-3"
          >
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "h-3.5 w-3.5 shrink-0 rounded-full border-2",
                  item.status === "current"
                    ? "border-accent bg-accent"
                    : "border-border-strong bg-bg-card",
                )}
              />
              {idx < roadmapItems.length - 1 && (
                <div
                  className={cn(
                    "h-[2px] w-full",
                    item.status === "current" ? "bg-accent" : "bg-border",
                  )}
                />
              )}
            </div>
            <div className="flex flex-col gap-3.5">
              <span
                className={cn(
                  "font-mono text-[11px]",
                  item.status === "current" ? "text-accent" : "text-text-muted",
                )}
              >
                {item.tag}
              </span>
              <h4 className="font-display text-xl font-bold text-text-primary">
                {item.title}
              </h4>
              <p className="font-body text-[13px] leading-[1.55] text-text-secondary">
                {item.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
