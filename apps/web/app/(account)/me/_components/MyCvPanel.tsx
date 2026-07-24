"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/ui";
import { meApi, type MeCv } from "@/lib/api/me";
import { CvSkillManager } from "@/features/cv-match/CvSkillManager";

const CV_KEY = ["me", "cv"];

// The user's owned CVs (MVP: one active). Delete removes only the ownership link
// — the shared candidate row survives (content-hash dedup).
export function MyCvPanel() {
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
    <section>
      <h2 className="mb-3 font-mono text-2xs uppercase tracking-wider text-text-muted">my cv</h2>
      {isLoading ? (
        <p className="font-mono text-2xs uppercase tracking-wider text-text-muted">loading…</p>
      ) : !cvs || cvs.length === 0 ? (
        <div className="border border-dashed border-border bg-bg-card p-6">
          <p className="mb-3 font-mono text-2xs uppercase tracking-wider text-text-secondary">
            no CV yet — upload one on the feed to match jobs
          </p>
          <Link href="/">
            <Button variant="secondary" size="sm">
              go to feed →
            </Button>
          </Link>
        </div>
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
    </section>
  );
}

function CvRow({ cv, onDelete, deleting }: { cv: MeCv; onDelete: () => void; deleting: boolean }) {
  const [managingSkills, setManagingSkills] = useState(false);
  const facts = [cv.seniority, cv.role, cv.experienceYears ? `${cv.experienceYears} yr` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="flex flex-col gap-3 border border-border bg-bg-card p-4 shadow-brut-sm">
      <div className="flex items-center justify-between gap-4">
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
        <div className="flex shrink-0 gap-2">
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
