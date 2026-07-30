"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/ui";
import { Panel } from "@/ui/layout/Panel";
import { EmptyState } from "@/ui/feedback/EmptyState";
import { meApi, type MeCv } from "@/lib/api/me";
import { CvSkillManager } from "@/features/cv-match/CvSkillManager";

import { ACCOUNT_QUERY_KEYS } from "./query-keys";

export function MyCvPanel({ className }: { className?: string }) {
  const qc = useQueryClient();
  const { data: cvs, isLoading } = useQuery({
    queryKey: ACCOUNT_QUERY_KEYS.cvs,
    queryFn: meApi.listCvs,
  });

  const remove = useMutation({
    mutationFn: (id: string) => meApi.deleteCv(id),
    onSuccess: () => {
      toast.success("CV видалено");
      void Promise.all([
        qc.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEYS.cvs }),
        qc.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEYS.subscriptions }),
      ]);
    },
    onError: () => toast.error("Не вдалося видалити CV"),
  });

  return (
    <Panel title="CV" meta={cvs?.length ? `${cvs.length}` : undefined} className={className}>
      {isLoading ? (
        <EmptyState title="завантаження…" />
      ) : !cvs || cvs.length === 0 ? (
        <EmptyState
          title="CV ще немає"
          hint="завантаж CV, щоб ранжувати вакансії"
          action={
            <Link href="/">
              <Button variant="secondary" size="sm">
                до вакансій →
              </Button>
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {cvs.map((cv) => (
            <CvRow key={cv.id} cv={cv} onDelete={remove.mutate} deleting={remove.isPending} />
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
}: {
  cv: MeCv;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  const [managingSkills, setManagingSkills] = useState(false);
  const handleSkills = () => setManagingSkills((visible) => !visible);
  const handleDelete = () => onDelete(cv.id);
  const facts = [cv.seniority, cv.role, cv.experienceYears ? `${cv.experienceYears} yr` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="flex flex-col gap-3 border border-border bg-bg p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="truncate font-display text-sm text-text-primary">
            {cv.label}
            {cv.isActive && (
              <span className="ml-2 font-mono text-2xs uppercase tracking-wider text-accent">
                активне
              </span>
            )}
          </p>
          {facts && (
            <p className="mt-1 font-mono text-2xs uppercase tracking-wider text-text-muted">
              {facts}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 sm:shrink-0">
          <Link href={`/?cv=${cv.candidateId}`}>
            <Button variant="secondary" size="sm">
              вакансії
            </Button>
          </Link>
          <Button
            variant="secondary"
            size="sm"
            aria-expanded={managingSkills}
            onClick={handleSkills}
          >
            {managingSkills ? "сховати навички" : "навички"}
          </Button>
          <Button variant="secondary" size="sm" onClick={handleDelete} disabled={deleting}>
            видалити
          </Button>
        </div>
      </div>
      {managingSkills ? <CvSkillManager candidateId={cv.candidateId} /> : null}
    </li>
  );
}
