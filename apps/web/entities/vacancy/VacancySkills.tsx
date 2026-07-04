"use client";

import { useMemo, useState } from "react";

import { SkillChip, type SkillTone } from "@/entities/skill/SkillChip";
import type { NodeRef } from "@/lib/api/vacancies";

const REQUIRED_SHOWN = 6;
const OPTIONAL_SHOWN = 5;

/** Warm lens: the candidate's resolved skill ids, to colour the card's own
 *  chips by have/lacks. Cold passes nothing → chips stay neutral (zero change). */
export type VacancyMatch = { haveSkillIds: readonly string[] };

// Required and optional skills on their own rows (colour is the label), each
// capped so a Kubernetes-shop posting doesn't dump 12 chips. One "показати всі"
// button reveals the rest in place — the count never floats mid-row.
export function VacancySkills({
  required,
  optional,
  match,
}: {
  required: NodeRef[];
  optional: NodeRef[];
  match?: VacancyMatch;
}) {
  const [expanded, setExpanded] = useState(false);
  const have = useMemo(
    () => (match ? new Set(match.haveSkillIds) : null),
    [match],
  );

  if (required.length === 0 && optional.length === 0) return null;

  const req = expanded ? required : required.slice(0, REQUIRED_SHOWN);
  const opt = expanded ? optional : optional.slice(0, OPTIONAL_SHOWN);
  const hidden =
    required.length - req.length + (optional.length - opt.length);

  // Required: have → green ✓, lacks → red ✗. Optional: have → green ✓,
  // lacks → neutral (a missing nice-to-have isn't a red flag).
  const reqTone = (s: NodeRef): SkillTone =>
    have ? (have.has(s.id) ? "have" : "missing") : "required";
  const optTone = (s: NodeRef): SkillTone =>
    have && have.has(s.id) ? "have" : "optional";

  return (
    <div className="flex flex-col gap-2">
      {req.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {req.map((s) => (
            <SkillChip key={s.id} name={s.name} tone={reqTone(s)} glyph={have != null} />
          ))}
        </div>
      ) : null}
      {opt.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {opt.map((s) => (
            <SkillChip key={s.id} name={s.name} tone={optTone(s)} glyph={have != null && have.has(s.id)} />
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
