export type RequirementGroupDropReason = "overlapping";

export type RequirementGroupDrop = { index: number; reason: RequirementGroupDropReason };

export type RequirementGroupResult = {
  groupByNode: Map<string, number>;
  drops: RequirementGroupDrop[];
};

/**
 * Number the choices among a vacancy's required skills, so an "A or B" scores as
 * one requirement (requirement-groups.md §5.2). Takes one entry per extracted
 * requirement — its members already resolved to node ids, in extraction order.
 *
 * A requirement that resolves to a single node is an ordinary flat link and
 * takes no number, which is also where a choice whose members collapse onto one
 * node through aliases lands. A node belongs to at most one choice: a later
 * requirement reaching a node an earlier one already numbered degrades to flat
 * links (I1) and is reported as `overlapping`.
 */
export function assignRequirementGroups(units: string[][]): RequirementGroupResult {
  const groupByNode = new Map<string, number>();
  const drops: RequirementGroupDrop[] = [];
  let stamped = 0;

  units.forEach((nodeIds, position) => {
    const members = [...new Set(nodeIds)];
    if (members.length < 2) return;
    if (members.some((nodeId) => groupByNode.has(nodeId))) {
      drops.push({ index: position + 1, reason: "overlapping" });
      return;
    }
    stamped += 1;
    for (const nodeId of members) groupByNode.set(nodeId, stamped);
  });

  return { groupByNode, drops };
}
