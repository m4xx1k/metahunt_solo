import { Card, Divider } from "@/components/ui-kit";
import { aboutMeSection } from "@/lib/landing-data";
import { Section } from "./Section";
import { SectionHeader } from "./SectionHeader";
import Image from 'next/image';
import Link from 'next/link';

export function AboutMe() {
  return (
    <Section id="about">
      <SectionHeader
        tag={aboutMeSection.tag}
        title={aboutMeSection.title}
        subtitle={aboutMeSection.subtitle}
      />

      <Card className="w-full max-w-[1280px] overflow-hidden p-0">
        <div className="flex flex-col md:flex-row">
          <div className="flex flex-col justify-center gap-5 border-b border-border px-8 py-10 md:w-[360px] md:border-r md:border-b-0 md:px-10">
            <div className="relative flex h-[320px] items-center justify-center rounded-[12px] border border-border-strong bg-bg-card">
              {/* <div className="font-mono text-[13px] text-text-muted">
                {"// photo.jpg"}
              </div> */}
              <Image src={'/me.jpg'} alt="me" fill className="rounded-[12px] object-contain bg-black/50" />
            </div>

            <div className="rounded-[10px] border border-border bg-bg-elev p-4">
              <p className="font-mono text-[12px] text-text-muted">
                {aboutMeSection.buildInPublicTitle}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {aboutMeSection.socialData.map((social) => (
                  <Link
                    style={{
                      backgroundColor: `#${social.bg}`
                    }}
                    href={social.link}
                    key={social.name}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-[8px] border border-border px-2.5 py-1 font-mono text-[12px] text-[#f8f9fa] font-black"
                  >
                    {social.name}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-4 bg-bg-card p-4 md:p-6">
            <div className="flex items-center justify-between rounded-[10px] border border-border bg-bg-elev px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#FF5F56]" />
                <span className="h-2 w-2 rounded-full bg-[#FFBD2E]" />
                <span className="h-2 w-2 rounded-full bg-[#27C93F]" />
              </div>
              <p className="font-mono text-[12px] text-text-muted">
                {aboutMeSection.terminalTitle}
              </p>
            </div>

            <div className="flex flex-col gap-3 rounded-[10px] border border-border bg-bg-elev p-4 md:p-5">
              <p className="font-mono text-[13px] font-bold text-accent">
                {"$ cat profile.yml"}
              </p>
              <div className="space-y-1">
                {aboutMeSection.profile.map((line) => (
                  <p key={line} className="font-mono text-[13px] text-text-primary">
                    {line}
                  </p>
                ))}
              </div>

              <Divider />

              <p className="font-mono text-[13px] font-bold text-accent">
                {"$ cat story.txt"}
              </p>
              <p className="font-body text-[15px] leading-[1.6] text-text-secondary">
                {aboutMeSection.story}
              </p>

              <Divider />

              <p className="font-mono text-[13px] font-bold text-accent">
                {"$ tail -n 3 achievements.log"}
              </p>
              <div className="space-y-1">
                {aboutMeSection.achievements.map((line) => (
                  <p key={line} className="font-mono text-[13px] text-text-primary">
                    {line}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Card>
    </Section>
  );
}
