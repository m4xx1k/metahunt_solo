import { Heading, Tag } from "@/ui";
import { hero } from "./data";

export function Hero() {
  return (
    <section className="flex flex-col items-start gap-5 py-14">
      <Tag>{hero.kicker}</Tag>
      <Heading level="h1" as="h1" className="max-w-[760px] text-4xl leading-[1.08] md:text-6xl">
        {hero.titleLines[0]}
        <br />
        {hero.titleLines[1]}
      </Heading>
      <p className="max-w-[640px] font-body text-base leading-[1.6] text-text-secondary md:text-lg">
        {hero.body}
      </p>
    </section>
  );
}
