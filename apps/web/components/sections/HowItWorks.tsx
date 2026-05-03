import { StepCard } from "@/components/ui-kit";
import { howSection, steps } from "@/lib/landing-data";
import { Section } from "./Section";
import { SectionHeader } from "./SectionHeader";

export function HowItWorks() {
  return (
    <Section id="how">
      <SectionHeader {...howSection} />
      <div className="flex flex-wrap justify-center gap-8">
        {steps.map((s) => (
          <StepCard key={s.number} {...s} className="w-full md:w-[380px]" />
        ))}
      </div>
    </Section>
  );
}
