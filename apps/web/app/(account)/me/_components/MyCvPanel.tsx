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

const CV_KEY = ["me", "cv"];

// The user's owned CVs (MVP: one active). Delete removes only the ownership link
// — the shared candidate row survives (content-hash dedup).
export function MyCvPanel({ className }: { className?: string }) {
  const qc = useQueryClient();
  const { data: cvs, isLoading } = useQuery({
    queryKey: CV_KEY,
    queryFn: meApi.listCvs,
  });

  const remove = useMutation({
    mutationFn: (id: string) => meApi.deleteCv(id),
    onSuccess: () => {
      toast.success("CV removed");
      void qc.invalidateQueries({ queryKey: CV_KEY });
    },
    onError: () => toast.error("Couldn't remove CV"),
  });

  return (
    <Panel
      title="my cv"
      meta={cvs?.length ? `${cvs.length} uploaded` : undefined}
      className={className}
    >
      {isLoading ? (
        <EmptyState title="loading…" />
      ) : !cvs || cvs.length === 0 ? (
        <EmptyState
          title="no CV yet"
          hint="upload one on the feed to rank jobs against it"
          action={
            <Link href="/">
              <Button variant="secondary" size="sm">
                go to feed →
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
              onDelete={() => remove.mutate(cv.id)}
              deleting={remove.isPending}
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function CvRow({ cv, onDelete, deleting }: { cv: MeCv; onDelete: () => void; deleting: boolean }) {
  const [managingSkills, setManagingSkills] = useState(false);
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
                active
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
              view feed
            </Button>
          </Link>
          <Button
            variant="secondary"
            size="sm"
            aria-expanded={managingSkills}
            onClick={() => setManagingSkills((v) => !v)}
          >
            {managingSkills ? "hide skills" : "manage skills"}
          </Button>
          <Button variant="secondary" size="sm" onClick={onDelete} disabled={deleting}>
            delete
          </Button>
        </div>
      </div>
      {managingSkills ? <CvSkillManager candidateId={cv.candidateId} /> : null}
    </li>
  );
}
