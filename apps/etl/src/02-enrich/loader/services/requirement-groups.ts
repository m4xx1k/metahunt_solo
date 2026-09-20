import type { SkillGroup } from "../../../baml_client/types";
import { normalizeAliasName } from "../../../platform/shared/normalize-alias";
import type { SkillLink } from "../repositories/vacancy.repository";

export type RequirementGroupDropReason =
  "unknown-member" | "too-few-members" | "optional-member" | "overlapping";

export type RequirementGroupDrop = { index: number; reason: RequirementGroupDropReason };

export type RequirementGroupResult = { stamped: number; drops: RequirementGroupDrop[] };

/**
 * Stamp `requirementGroup` onto the links a vacancy already has, so an "A or B"
 * choice scores as one requirement (requirement-groups.md §5.2).
 *
 * Every rule drops the offending group, never the extraction: a malformed
 * overlay degrades to today's flat behaviour. Members are matched by
 * alias-normalized name against links this vacancy already resolved — a group
 * name never resolves a node of its own, so the model cannot mint taxonomy
 * through this field.
 */
export function stampRequirementGroups(
  links: Map<string, SkillLink>,
  groups: SkillGroup[],
  nodeIdByName: Map<string, string>,
): RequirementGroupResult {
  const drops: RequirementGroupDrop[] = [];
  let stamped = 0;

  groups.forEach((group, position) => {
    const index = position + 1;
    const ids = new Set<string>();
    let unknownMember = false;

    for (const name of group.anyOf ?? []) {
      const nodeId = nodeIdByName.get(normalizeAliasName(name));
      if (!nodeId) {
        unknownMember = true;
        break;
      }
      ids.add(nodeId);
    }

    const members = Array.from(ids, (nodeId) => links.get(nodeId));
    const reason = unknownMember
      ? "unknown-member"
      : ids.size < 2
        ? "too-few-members"
        : members.some((link) => !link?.isRequired)
          ? "optional-member"
          : members.some((link) => link?.requirementGroup != null)
            ? "overlapping"
            : null;

    if (reason) {
      drops.push({ index, reason });
      return;
    }

    for (const link of members) {
      if (link) link.requirementGroup = stamped + 1;
    }
    stamped += 1;
  });

  return { stamped, drops };
}
