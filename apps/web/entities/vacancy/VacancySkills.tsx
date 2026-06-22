"use client";

import { useState } from "react";

import { SkillChip } from "@/entities/skill/SkillChip";
import type { NodeRef } from "@/lib/api/vacancies";

const REQUIRED_SHOWN = 6;
const OPTIONAL_SHOWN = 5;

// Required and optional skills on their own rows (colour is the label), each
// capped so a Kubernetes-shop posting doesn't dump 12 chips. One "показати всі"
// button reveals the rest in place — the count never floats mid-row.
export function VacancySkills({
  required,
  optional,
}: {
  required: NodeRef[];
  optional: NodeRef[];
}) {
  const [expanded, setExpanded] = useState(false);

  if (required.length === 0 && optional.length === 0) return null;

  const req = expanded ? required : required.slice(0, REQUIRED_SHOWN);
  const opt = expanded ? optional : optional.slice(0, OPTIONAL_SHOWN);
  const hidden =
    required.length - req.length + (optional.length - opt.length);

  return (
    <div className="flex flex-col gap-2">
      {req.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {req.map((s) => (
            <SkillChip key={s.id} name={s.name} tone="required" />
          ))}
        </div>
      ) : null}
      {opt.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {opt.map((s) => (
            <SkillChip key={s.id} name={s.name} tone="optional" />
          ))}
        </div>
      ) : null}
      {hidden > 0 || expanded ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-fit font-mono text-2xs uppercase tracking-wider text-text-muted transition-colors hover:text-accent"
        >
          {expanded ? "− згорнути" : `+ показати всі (${hidden})`}
        </button>
      ) : null}
    </div>
  );
}
