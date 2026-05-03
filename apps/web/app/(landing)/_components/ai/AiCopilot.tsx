import { Section, SectionHeader } from "@/components/ui-kit";
import { FeatureCard } from "./FeatureCard";
import { aiCopilotSection, aiFeatures } from "./data";

export function AiCopilot() {
  const row1 = aiFeatures.slice(0, 3);
  const row2 = aiFeatures.slice(3);

  return (
    <Section id="ai">
      <SectionHeader {...aiCopilotSection} />
      <div className="flex flex-col gap-8">
        <div className="flex flex-wrap justify-center gap-8">
          {row1.map((f) => (
            <FeatureCard key={f.title} {...f} className="w-full md:w-[380px]" />
          ))}
        </div>
        <div className="flex flex-wrap justify-center gap-8">
          {row2.map((f) => (
            <FeatureCard key={f.title} {...f} className="w-full md:w-[500px]" />
          ))}
        </div>
      </div>
    </Section>
  );
}
