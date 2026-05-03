import { EmailInput, Heading } from "@/components/ui-kit";
import { hero } from "./data";

export function Hero() {
  return (
    <section className="w-full px-6 pt-20 pb-24 md:px-20 md:pt-20 md:pb-[100px]">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col items-center gap-12 text-center">
        <div className="flex flex-col items-center gap-8">
          <Heading
            level="h1"
            as="h1"
            className="text-center text-[44px] leading-[1.05] md:text-[88px]"
          >
            {hero.title}
          </Heading>
          <p className="max-w-[700px] font-body text-base leading-[1.55] text-text-secondary">
            {hero.subtitle}
          </p>
        </div>
        <EmailInput cta={hero.cta} />
        <p className="font-body text-[13px] text-text-muted">
          {hero.microCopy}
        </p>
      </div>
    </section>
  );
}
