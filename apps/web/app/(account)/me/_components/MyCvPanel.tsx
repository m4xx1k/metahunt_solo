"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/ui";
import { Panel } from "@/ui/layout/Panel";
import { EmptyState } from "@/ui/feedback/EmptyState";
import { meApi, type MeCv } from "@/lib/api/me";
import { CvSkillManager } from "@/features/cv-match/CvSkillManager";

import { ACCOUNT_QUERY_KEYS } from "./query-keys";

export function MyCvPanel({ className }: { className?: string }) {
  // `/me?cv=<id>#cv` — the section anchor scrolls (it is server-rendered), the
  // param says which row to pick out once the list arrives.
  const targetCv = useSearchParams().get("cv");
  const qc = useQueryClient();
  const { data: cvs, isLoading } = useQuery({
    queryKey: ACCOUNT_QUERY_KEYS.cvs,
    queryFn: meApi.listCvs,
  });

  const remove = useMutation({
    mutationFn: (id: string) => meApi.deleteCv(id),
    onSuccess: () => {
      toast.success("CV deleted");
      void Promise.all([
        qc.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEYS.cvs }),
        qc.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEYS.subscriptions }),
      ]);
    },
    onError: () => toast.error("Could not delete it"),
  });

  return (
    <Panel title="CV" meta={cvs?.length ? `${cvs.length}` : undefined} className={className}>
      {isLoading ? (
        <EmptyState title="loading…" />
      ) : !cvs || cvs.length === 0 ? (
        <EmptyState
          title="no CVs yet"
          hint="add a CV to see your best matches"
          action={
            <Link href="/">
              <Button variant="secondary" size="sm">
                see jobs →
              </Button>
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {cvs.map((cv) => (
            <CvRow
              key={cv.id}
              cv={cv}
              onDelete={remove.mutate}
              deleting={remove.isPending}
              highlighted={cv.candidateId === targetCv}
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function CvRow({
  cv,
  onDelete,
  deleting,
  highlighted,
}: {
  cv: MeCv;
  onDelete: (id: string) => void;
  deleting: boolean;
  highlighted: boolean;
}) {
  const qc = useQueryClient();
  const router = useRouter();
  const [managingSkills, setManagingSkills] = useState(false);
  const handleSkills = () => setManagingSkills((visible) => !visible);
  const handleDelete = () => onDelete(cv.id);
  // The upload time leads: several CVs commonly share a role label, and it is
  // the only thing that tells them apart.
  const addedAt = new Date(cv.createdAt).toLocaleString("uk-UA", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const facts = [cv.seniority, cv.role, cv.experienceYears ? `${cv.experienceYears} yr` : null]
    .filter(Boolean)
    .join(" · ");

  // MET-144: the feed scores against the JWT's active CV, never a URL param
  // — so viewing a non-active CV's matches means activating it first. Already
  // active → skip the round trip and just navigate (`?open=cv` lands the
  // completed flow in the warm lens the same way /match's redirect does).
  const activate = useMutation({
    mutationFn: () => meApi.activateCv(cv.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEYS.cvs }),
    onError: () => toast.error("Could not switch"),
  });
  const handleViewJobs = () => {
    if (cv.isActive) {
      router.push("/?open=cv");
      return;
    }
    activate.mutate(undefined, { onSuccess: () => router.push("/?open=cv") });
  };

  return (
    <li
      id={`cv-${cv.candidateId}`}
      className={cn(
        "flex scroll-mt-24 flex-col gap-3 border bg-bg p-4",
        highlighted ? "border-accent" : "border-border",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="truncate font-display text-sm text-text-primary">
            {cv.label}
            {cv.isActive && (
              <span className="ml-2 font-mono text-2xs uppercase tracking-wider text-accent">
                active
              </span>
            )}
          </p>
          <p className="mt-1 font-mono text-2xs uppercase tracking-wider text-text-muted">
            {addedAt}
            {facts ? ` · ${facts}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:shrink-0">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleViewJobs}
            disabled={activate.isPending}
          >
            jobs
          </Button>
          <Button
            variant="secondary"
            size="sm"
            aria-expanded={managingSkills}
            onClick={handleSkills}
          >
            {managingSkills ? "hide skills" : "skills"}
          </Button>
          <Button variant="secondary" size="sm" onClick={handleDelete} disabled={deleting}>
            delete
          </Button>
        </div>
      </div>
      {managingSkills ? <CvSkillManager candidateId={cv.candidateId} /> : null}
    </li>
  );
}
