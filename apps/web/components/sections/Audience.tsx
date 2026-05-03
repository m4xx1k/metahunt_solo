import { CheckIcon } from "@phosphor-icons/react/dist/ssr";
import { Card } from "@/components/ui-kit";
import { audienceSection } from "@/lib/landing-data";
import { Section } from "./Section";
import { SectionHeader } from "./SectionHeader";

export function Audience() {
  const { card } = audienceSection;

  return (
    <Section id="audience" variant="elevated">
      <SectionHeader tag={audienceSection.tag} title={audienceSection.title} />
      <Card className="flex w-full max-w-[800px] flex-col gap-6 p-10">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/15 text-accent">
            {card.icon}
          </div>
          <h3 className="font-display text-[26px] font-bold text-text-primary">
            {card.title}
          </h3>
        </div>
        <p className="font-body text-[15px] leading-[1.6] text-text-secondary">
          {card.description}
        </p>
        <div className="flex flex-col gap-2.5">
          {card.bullets.map((bullet, idx) => (
            <div key={idx} className="flex items-center gap-2.5">
              <CheckIcon weight="bold" className="h-[18px] w-[18px] text-accent" />
              <span className="font-body text-sm text-text-primary">
                {bullet}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </Section>
  );
}
