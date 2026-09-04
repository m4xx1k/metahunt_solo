import Link from "next/link";

import { ApplyLink } from "@/entities/vacancy/ApplyLink";
import type { VacancyDto } from "@/lib/api/vacancies";
import { formatRelative } from "@/lib/format";
import { InfoHint } from "@/ui/overlay/InfoHint";

import { FitPanel } from "./FitPanel";
import { SimilarVacancyCard } from "./SimilarVacancyCard";
import { VacancyPanel } from "./VacancyPanel";

// The loader stamps loadedAt and updatedAt in the same insert, so a row that was
// never re-ingested has them milliseconds apart rather than exactly equal.
const MINUTE_MS = 60_000;

const HUB_LINK =
  "font-mono text-xs text-text-secondary underline-offset-4 transition-colors hover:text-accent hover:underline";

/**
 * Everything that is *about* the posting rather than *in* it: how to apply,
 * where it came from, who posted it, what else looks like it. A rail from xl,
 * a stack under the description below that.
 */
export function VacancyRail({
  vacancy,
  similar,
  roleHubSlug,
  role,
  className,
}: {
  vacancy: VacancyDto;
  similar: VacancyDto[];
  roleHubSlug: string | null;
  role: string;
  className?: string;
}) {
  const sourceName = vacancy.source.displayName.trim();
  const company = vacancy.company;
  const reposted =
    new Date(vacancy.updatedAt).getTime() - new Date(vacancy.loadedAt).getTime() > MINUTE_MS;

  return (
    <div className={className}>
      <div className="flex flex-col gap-4">
        {/* Per-viewer Fit — a client island: the page itself is force-static,
            so this fetches /feed/vacancy/:id again where the token is readable
            and renders nothing until a signed-in viewer's CV scores it. */}
        <FitPanel vacancyId={vacancy.id} />

        {vacancy.link ? (
          <VacancyPanel>
            <ApplyLink vacancyId={vacancy.id} sourceName={sourceName} variant="button" />
            <span className="text-center font-mono text-2xs uppercase tracking-wider text-text-muted">
              posted {formatRelative(vacancy.publishedAt)}
            </span>
          </VacancyPanel>
        ) : null}

        <VacancyPanel title="джерело">
          <dl className="flex flex-col gap-2">
            <RailRow label="source" value={sourceName} />
            <RailRow
              label="posted"
              value={formatRelative(vacancy.publishedAt)}
              hint="Дата на самому оголошенні, як її віддає джерело."
            />
            <RailRow
              label="first seen"
              value={formatRelative(vacancy.loadedAt)}
              hint="Коли metahunt уперше завантажив це оголошення."
            />
            {/* Not "last seen": updatedAt only moves when the source emits an
                item whose hash changed, so an untouched live listing and a
                delisted one both sit still. Showing it when it equals first-seen
                would just claim a change that never happened. */}
            {reposted ? (
              <RailRow
                label="last change"
                value={formatRelative(vacancy.updatedAt)}
                hint="Коли джерело востаннє змінило текст оголошення. Не перевірка, чи воно ще живе."
              />
            ) : null}
          </dl>
        </VacancyPanel>

        {company?.slug || roleHubSlug ? (
          <VacancyPanel title="дивитись також">
            {company?.slug ? (
              <Link href={`/company/${company.slug}`} className={HUB_LINK}>
                вакансії в {company.name} →
              </Link>
            ) : null}
            {roleHubSlug ? (
              <Link href={`/role/${roleHubSlug}`} className={HUB_LINK}>
                усі вакансії {role} →
              </Link>
            ) : null}
          </VacancyPanel>
        ) : null}

        {similar.length > 0 ? (
          <VacancyPanel title="схожі вакансії" className="bg-transparent">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {similar.map((s) => (
                <SimilarVacancyCard key={s.id} vacancy={s} />
              ))}
            </div>
          </VacancyPanel>
        ) : null}
      </div>
    </div>
  );
}

function RailRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="flex items-center gap-1 font-mono text-2xs uppercase tracking-wider text-text-muted">
        {label}
        {hint ? <InfoHint label={label}>{hint}</InfoHint> : null}
      </dt>
      <dd className="font-mono text-xs text-text-primary">{value}</dd>
    </div>
  );
}
