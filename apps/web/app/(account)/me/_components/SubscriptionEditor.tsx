"use client";

import { useCallback, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";

import { FilterRail } from "@/features/vacancy-filters/FilterRail";
import { SENIORITY_OPTIONS, WORK_FORMAT_OPTIONS } from "@/features/vacancy-filters/enum-options";
import {
  areFiltersEqual,
  filtersToSubscriptionCriteria,
  subscriptionCriteriaToFilters,
} from "@/features/vacancy-filters/subscription-criteria";
import { useLocalFilters } from "@/features/vacancy-filters/use-local-filters";
import type { OptionRow } from "@/features/vacancy-filters/types";
import type { MeSubscription, UpdateSubscription } from "@/lib/api/me";
import type { CvMatchParams } from "@/lib/api/subscriptions";
import { Button } from "@/ui";
import { MultiSelect } from "@/ui/inputs/MultiSelect";

export function SubscriptionEditor({
  subscription,
  roles,
  skills,
  domains,
  busy,
  onSave,
  onCancel,
}: {
  subscription: MeSubscription;
  roles: OptionRow[];
  skills: OptionRow[];
  domains: OptionRow[];
  busy: boolean;
  onSave: (id: string, patch: UpdateSubscription) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(subscription.name || subscription.label);
  const params = useMemo<CvMatchParams>(
    () => (subscription.isCv ? subscription.params : {}),
    [subscription],
  );
  const initialFilters = useMemo(() => subscriptionCriteriaToFilters(params), [params]);
  const filters = useLocalFilters(initialFilters);

  const handleName = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setName(event.target.value);
  }, []);
  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const nextName = name.trim();
      if (!nextName) return;
      const patch: UpdateSubscription = { name: nextName };
      if (subscription.isCv && !areFiltersEqual(filters.filters, initialFilters)) {
        patch.params = filtersToSubscriptionCriteria(filters.filters, params, initialFilters);
      }
      onSave(subscription.id, patch);
    },
    [filters.filters, initialFilters, name, onSave, params, subscription.id, subscription.isCv],
  );

  return (
    <li>
      <form onSubmit={handleSubmit} className="border border-accent/60 bg-bg-elev p-4 sm:p-5">
        <label className="flex flex-col gap-2 font-mono text-2xs uppercase tracking-wider text-text-muted">
          name
          <input
            value={name}
            onChange={handleName}
            maxLength={64}
            className="border border-border bg-bg px-3 py-2 font-sans text-sm normal-case tracking-normal text-text-primary focus:border-accent focus:outline-none"
          />
        </label>

        {subscription.isCv ? (
          <div className="mt-5 border-t border-border">
            <p className="py-3 font-mono text-2xs text-text-muted">
              * old type · sorted by CV{" "}
              {subscription.cvLabel ? (
                <Link
                  href={`/me?cv=${subscription.candidateId}#cv`}
                  className="normal-case text-text-secondary underline-offset-2 hover:text-accent hover:underline"
                >
                  {subscription.cvLabel}
                </Link>
              ) : (
                <span className="text-danger">(deleted)</span>
              )}
            </p>
            <FilterRail
              api={filters}
              lens="warm"
              seniorityOptions={SENIORITY_OPTIONS}
              workFormatOptions={WORK_FORMAT_OPTIONS}
              roleOptions={roles}
              domainOptions={domains}
            />
            <MultiSelect
              title="excluded skills"
              options={skills}
              selected={filters.filters.excludedSkillIds}
              onToggle={filters.toggleExcludedSkill}
              searchable
              searchPlaceholder="find a skill…"
            />
          </div>
        ) : (
          <p className="mt-4 font-mono text-2xs text-text-muted">
            Change this filter on the main page.
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <Button type="submit" size="sm" disabled={busy || name.trim().length === 0}>
            {busy ? "saving…" : "save"}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
            cancel
          </Button>
        </div>
      </form>
    </li>
  );
}
