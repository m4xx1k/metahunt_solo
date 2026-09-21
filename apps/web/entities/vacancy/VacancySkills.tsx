"use client";

import { useMemo, useState } from "react";

import { SkillChip, SKILL_TONES, type SkillSize, type SkillTone } from "@/entities/skill/SkillChip";
import type { NodeRef, RequirementRef } from "@/lib/api/vacancies";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/overlay/Tooltip";

import { requirementUnits } from "./requirement-units";

const OPTIONAL_SHOWN = 5;

/** Warm lens: the candidate's resolved skill ids, to colour the card's own
 *  chips by have/lacks. Cold passes nothing → chips stay neutral (zero change). */
export type VacancyMatch = { haveSkillIds: readonly string[] };

// One requirement, one chip. Members sharing a `group` are alternatives, so a
// satisfied choice shows what the viewer actually has ("aws") rather than a ✓
// on two clouds they never touched, and an unsatisfied one names them all.
// Stacked edges plus the tooltip keep the alternatives reachable.
function requirementChips(required: RequirementRef[], have: Set<string> | null) {
  return requirementUnits(required).map((members) => {
    const matched = have ? members.filter((m) => have.has(m.id)) : [];
    const shown = matched.length > 0 ? matched : members;
    return {
      id: members[0].id,
      label: shown.map((m) => m.name).join(" / "),
      tone: (have ? (matched.length > 0 ? "have" : "missing") : "required") as SkillTone,
      // Only when the label hides members — an unsatisfied choice already
      // spells every one of them out.
      alternatives: matched.length > 0 && members.length > 1 ? members.map((m) => m.name) : [],
    };
  });
}

function ChoiceChip({
  label,
  tone,
  size,
  alternatives,
}: {
  label: string;
  tone: SkillTone;
  size: SkillSize;
  alternatives: string[];
}) {
  const layers = Math.min(alternatives.length - 1, 2);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="relative inline-flex cursor-help">
          {Array.from({ length: layers }, (_, i) => (
            <span
              key={i}
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-0 border",
                SKILL_TONES[tone],
                i === 0 ? "opacity-50" : "opacity-25",
              )}
              style={{ transform: `translate(${(i + 1) * 3}px, ${(i + 1) * -3}px)` }}
            />
          ))}
          <span className="relative">
            <SkillChip name={label} tone={tone} size={size} glyph />
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent>any one of: {alternatives.join(", ").toLowerCase()}</TooltipContent>
    </Tooltip>
  );
}

// Required and optional skills on their own rows (colour is the label). Required
// is never truncated — what the role demands is always fully visible; optional
// caps at OPTIONAL_SHOWN with one show-all button revealing the overflow in
// place, unless the caller opts out of collapsing entirely.
export function VacancySkills({
  required,
  optional,
  match,
  size = "sm",
  collapseOptional = true,
}: {
  required: RequirementRef[];
  optional: NodeRef[];
  match?: VacancyMatch;
  size?: SkillSize;
  /** Feed cards cap the optional row to stay scannable; the vacancy page has
   *  the room and is where someone reads the full requirement list. */
  collapseOptional?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const have = useMemo(() => (match ? new Set(match.haveSkillIds) : null), [match]);

  if (required.length === 0 && optional.length === 0) return null;

  const opt = expanded || !collapseOptional ? optional : optional.slice(0, OPTIONAL_SHOWN);
  const hidden = optional.length - opt.length;

  // Required: have → green ✓, lacks → red ✗. Optional: have → green ✓ (dotted,
  // "bonus you already have"), lacks → neutral (a missing nice-to-have isn't a
  // red flag).
  const optTone = (s: NodeRef): SkillTone => (have && have.has(s.id) ? "have" : "optional");

  return (
    <div className="flex flex-col gap-2">
      {required.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {requirementChips(required, have).map((u) =>
            u.alternatives.length > 1 ? (
              <ChoiceChip
                key={u.id}
                label={u.label}
                tone={u.tone}
                size={size}
                alternatives={u.alternatives}
              />
            ) : (
              <SkillChip key={u.id} name={u.label} tone={u.tone} size={size} glyph={have != null} />
            ),
          )}
        </div>
      ) : null}
      {opt.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {opt.map((s) => (
            <SkillChip
              key={s.id}
              name={s.name}
              tone={optTone(s)}
              size={size}
              glyph={have != null && have.has(s.id)}
              dotted={have != null && have.has(s.id)}
            />
          ))}
        </div>
      ) : null}
      {collapseOptional && (hidden > 0 || expanded) ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-fit font-mono text-2xs uppercase tracking-wider text-text-muted transition-colors hover:text-accent"
        >
          {expanded ? "− collapse" : `+ show all (${hidden})`}
        </button>
      ) : null}
    </div>
  );
}
