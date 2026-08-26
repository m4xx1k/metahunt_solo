import { FlagPill } from "@/entities/vacancy/FlagPill";
import { capitalize } from "@/lib/format";
import {
  EMPLOYMENT_LABELS,
  ENGAGEMENT_LABELS,
  WORK_FORMAT_LABELS,
  type EmploymentType,
  type EngagementType,
  type WorkFormat,
} from "@/lib/extracted-vacancy";

/**
 * The three facts that answer "what kind of job is this" before you read a
 * word of the description. Labelled on purpose: `outsource` and `contract`
 * alone are ambiguous, and the seniority badge next to the H1 already carries
 * the one fact that reads fine unlabelled.
 */
export function VacancyMetaPills({
  workFormat,
  employmentType,
  engagementType,
}: {
  workFormat: WorkFormat | null;
  employmentType: EmploymentType | null;
  engagementType: EngagementType | null;
}) {
  if (!workFormat && !employmentType && !engagementType) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {workFormat ? (
        <FlagPill label="format" value={capitalize(WORK_FORMAT_LABELS[workFormat])} tone="muted" />
      ) : null}
      {employmentType ? (
        <FlagPill label="type" value={capitalize(EMPLOYMENT_LABELS[employmentType])} tone="muted" />
      ) : null}
      {engagementType ? (
        <FlagPill
          label="company"
          value={capitalize(ENGAGEMENT_LABELS[engagementType])}
          tone="info"
        />
      ) : null}
    </div>
  );
}
