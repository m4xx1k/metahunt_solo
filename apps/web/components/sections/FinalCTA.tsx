import { ctaSection } from "@/lib/landing-data";
import { Section } from "./Section";
import { FinalCTAForm } from "./FinalCTAForm";

export function FinalCTA() {
  return (
    <Section id="cta" variant="elevated">
      <div className="relative flex w-full max-w-[1080px] flex-col items-center gap-8 overflow-hidden rounded-[24px] border border-accent bg-linear-to-br from-[#1A1209] to-[#0A0A0B] p-10 py-20 text-center shadow-[0_80px_80px_-40px_rgba(255,122,26,0.2)] md:p-20">
        <div className="flex flex-col items-center gap-8">
          <div className="flex flex-col items-center gap-4">
            <span className="font-mono text-[13px] text-accent">
              {ctaSection.tag}
            </span>
            <h2 className="max-w-[14ch] font-display text-[40px] font-bold leading-[1.05] tracking-[-0.02em] text-text-primary md:text-[60px]">
              {ctaSection.title}
            </h2>
            <p className="max-w-[680px] font-body text-[17px] leading-[1.6] text-text-secondary">
              {ctaSection.subtitle}
            </p>
          </div>

          <FinalCTAForm />

         
        </div>
      </div>
    </Section>
  );
}
