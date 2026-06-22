import { Section } from "@/ui";
import { FinalCTAForm } from "./FinalCTAForm";
import { ctaSection } from "./data";

export function FinalCTA() {
  return (
    <Section id="cta" variant="base">
      <div className="relative flex w-full max-w-[1080px] flex-col items-center gap-8 overflow-hidden border border-accent bg-accent-subtle-bg p-10 py-20 text-center shadow-brut-lg md:p-20">
        <div className="flex flex-col items-center gap-8">
          <div className="flex flex-col items-center gap-4">
            <span className="font-mono text-xs text-accent">
              {ctaSection.tag}
            </span>
            <h2 className="max-w-[14ch] font-display text-4xl font-bold leading-[1.05] tracking-[-0.02em] text-text-primary md:text-6xl">
              {ctaSection.title}
            </h2>
            <p className="max-w-[680px] font-body text-lg leading-[1.6] text-text-secondary">
              {ctaSection.subtitle}
            </p>
          </div>

          <FinalCTAForm />
        </div>
      </div>
    </Section>
  );
}
