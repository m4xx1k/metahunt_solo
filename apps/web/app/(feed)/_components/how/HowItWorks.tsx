import { Section, SectionHeader } from "@/components/ui-kit";
import { StepCard } from "./StepCard";
import { howSection, steps } from "./data";

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
