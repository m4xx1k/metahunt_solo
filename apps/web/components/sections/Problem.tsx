import { ProblemCard } from "@/components/ui-kit";
import { problemSection, problems } from "@/lib/landing-data";
import { Section } from "./Section";
import { SectionHeader } from "./SectionHeader";

export function Problem() {
  return (
    <Section id="problem" variant="elevated">
      <SectionHeader {...problemSection} />
      <div className="flex flex-wrap justify-center gap-8">
        {problems.map((p) => (
          <ProblemCard key={p.title} {...p} className="w-full md:w-[400px]" />
        ))}
      </div>
    </Section>
  );
}
