import { Heading, Tag } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

export function SectionHeader({
  tag,
  title,
  subtitle,
  className,
}: {
  tag?: string;
  title: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-full max-w-[1024px] flex-col items-center gap-4 text-center",
        className,
      )}
    >
      {tag && <Tag>{tag}</Tag>}
      <Heading
        level="section"
        className="text-center text-[40px] md:text-[64px]"
      >
        {title}
      </Heading>
      {subtitle && (
        <p className="max-w-[720px] font-body text-base leading-[1.6] text-text-secondary md:text-[17px]">
          {subtitle}
        </p>
      )}
    </div>
  );
}
