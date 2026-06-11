import type { VacancyAggregates } from "@/lib/api/aggregates";
import { Tag, Divider } from "@/components/ui-kit";
import { TotalCounter } from "./TotalCounter";
import { Pipeline } from "../pipeline/Pipeline";

// Intro / hero for the feed. One cohesive block (no separate background band):
// the headline + live counter say *what this is*, and the 3-stage pipeline
// below says *how it works* (Збір → Розбір → Підбір). The pipeline only shows
// on the bare index (`showPipeline`), not on track pages. The old stat widgets
// (TopSkills / SeniorityBars / …) were deleted as unrendered dead code — git
// history has them if a stats band ever comes back.

type Props = {
  aggregates: VacancyAggregates;
  showPipeline?: boolean;
};

export function FeedHero({ aggregates: a, showPipeline = false }: Props) {
  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-6 pt-16 pb-10 md:px-12">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[3fr_2fr] md:items-stretch">
        <div className="flex flex-col justify-center gap-5">
          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-text-primary md:text-5xl">
            <span className="text-accent">[</span>metahunt
            <span className="text-accent">]</span>
          </h1>
          <p className="max-w-[560px] font-body text-base leading-[1.55] text-text-secondary md:text-lg">
            <span className="font-medium text-text-primary">
              Всі IT-вакансії — в одному списку.
            </span>{" "}
            Збираємо з{" "}
            <span className="font-medium text-accent-secondary">
              усіх джерел
            </span>
            , структуруємо через{" "}
            <span className="font-medium text-accent">AI</span> та підбираємо під{" "}
            <span className="font-medium text-success">твоє резюме</span>.
          </p>
        </div>
        <TotalCounter
          total={a.total}
          lastSyncAt={a.lastSyncAt}
          sources={a.sources}
        />
      </div>

      {showPipeline && (
        <div className="flex flex-col items-center gap-6">
          <Tag>{"> як це працює"}</Tag>
          <Pipeline aggregates={a} />
        </div>
      )}

      <Divider className="mt-2" />
    </section>
  );
}
