import { ArrowDown } from "@phosphor-icons/react/dist/ssr";
import { Section, SectionHeader } from "@/components/ui-kit";
import { GoldenJobCard } from "./GoldenJobCard";
import { RawJobCard } from "./RawJobCard";
import { goldenJob, rawJobs, resultSection } from "./data";

export function Result() {
  return (
    <Section id="result" variant="elevated">
      <SectionHeader {...resultSection} />
      <div className="flex w-full max-w-[1100px] flex-col items-center gap-10">
        <div className="grid w-full grid-cols-1 gap-5 md:grid-cols-3">
          {rawJobs.map((job) => (
            <RawJobCard key={job.title} {...job} />
          ))}
        </div>
        <ArrowDown
          weight="bold"
          className="h-8 w-8 text-accent"
          aria-hidden
        />
        <GoldenJobCard job={goldenJob} />
      </div>
    </Section>
  );
}
