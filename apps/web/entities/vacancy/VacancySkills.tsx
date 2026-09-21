"use client";

import { useMemo, useState } from "react";

import { SkillChip, SKILL_TONES, type SkillSize, type SkillTone } from "@/entities/skill/SkillChip";
import type { NodeRef, RequirementRef } from "@/lib/api/vacancies";
import { cn } from "@/lib/utils";
import { requirementUnits } from "./requirement-units";

const OPTIONAL_SHOWN = 5;

/** Warm lens: the candidate's resolved skill ids, to colour the card's own
 *  chips by have/lacks. Cold passes nothing → chips stay neutral (zero change). */
export type VacancyMatch = { haveSkillIds: readonly string[] };

// One requirement, one chip — a real skill name, never a slash list. A choice
// keeps its alternatives behind the front chip as a stack, and hovering deals
// them upward. Front is what the viewer already has when the choice is
// satisfied, so a held AWS never renders as a ✗ on two clouds they never
// touched; otherwise it is the first member.
function requirementChips(required: RequirementRef[], have: Set<string> | null) {
  return requirementUnits(required).map((members) => {
    const front = (have && members.find((m) => have.has(m.id))) || members[0];
    return {
      id: front.id,
      label: front.name,
      tone: (have ? (have.has(front.id) ? "have" : "missing") : "required") as SkillTone,
      members: members.map((m) => ({
        id: m.id,
        name: m.name,
        held: have ? have.has(m.id) : false,
      })),
    };
  });
}

type ChoiceMember = { id: string; name: string; held: boolean };

// A choice at rest is one chip over two offset edges. On hover (and on focus,
// which is what a tap and the keyboard both give us) the edges fade and the
// alternatives rise into a labelled panel, bottom one first.
//
// The panel is absolutely positioned and rises ABOVE the row: dealing the
// alternatives out inline would reflow the chip row and, inside `flex-wrap`,
// could rewrap the whole thing mid-hover.
//
// Inside the panel only a held alternative is coloured. The others stay
// neutral rather than red, because the panel answers "what would count here",
// not "what are you missing" — the front chip already carries that verdict.
function ChoiceChip({
  label,
  tone,
  size,
  members,
}: {
  label: string;
  tone: SkillTone;
  size: SkillSize;
  members: ChoiceMember[];
}) {
  // One edge per hidden alternative, two deep at most — enough to read as
  // "there are more behind this" without turning into a smear.
  const layers = Math.min(members.length - 1, 2);
  return (
    <span
      tabIndex={0}
      className="group relative inline-flex cursor-help focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {Array.from({ length: layers }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 border transition-opacity duration-150",
            SKILL_TONES[tone],
            i === 0 ? "opacity-60" : "opacity-30",
            "group-hover:opacity-0 group-focus-within:opacity-0",
          )}
          style={{ transform: `translate(${(i + 1) * 3}px, ${(i + 1) * -3}px)` }}
        />
      ))}

      <span
        className={cn(
          // w-max, or the panel inherits the front chip's width and a long
          // alternative wraps — and a wrapped inline chip splits its border
          // into two boxes, reading as two skills.
          "pointer-events-none absolute bottom-full left-0 z-20 mb-1.5 w-max flex flex-col-reverse gap-1",
          "border border-border bg-bg-elev px-2 pb-1.5 pt-1",
          "opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100",
        )}
      >
        {members.map((m, i) => (
          <span
            key={m.id}
            className={cn(
              "block translate-y-1 whitespace-nowrap opacity-0 transition duration-150",
              "group-hover:translate-y-0 group-hover:opacity-100",
              "group-focus-within:translate-y-0 group-focus-within:opacity-100",
            )}
            style={{ transitionDelay: `${i * 40}ms` }}
          >
            <SkillChip name={m.name} tone={m.held ? "have" : "optional"} size="xs" glyph={m.held} />
          </span>
        ))}
        <span className="order-last whitespace-nowrap font-mono text-2xs uppercase tracking-wider text-text-muted">
          any one of
        </span>
      </span>

      {/* Opaque, so the edges read as sheets behind this one rather than
          lines crossing it. */}
      <span className="relative bg-bg-card">
        <SkillChip name={label} tone={tone} size={size} glyph />
      </span>
    </span>
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
            u.members.length > 1 ? (
              <ChoiceChip
                key={u.id}
                label={u.label}
                tone={u.tone}
                size={size}
                members={u.members}
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
