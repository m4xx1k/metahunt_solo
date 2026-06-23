import type { NodeType } from "@metahunt/database";

// Filter VERIFIED taxonomy rows to one type and join their names for an LLM
// prompt. Stable (locale) order keeps the prompt prefix byte-identical between
// calls, which is what lets provider-side prompt caching kick in.
export function joinNamesByType(
  rows: readonly { type: NodeType; name: string }[],
  type: NodeType,
): string {
  return rows
    .filter((n) => n.type === type)
    .map((n) => n.name)
    .sort((a, b) => a.localeCompare(b))
    .join(", ");
}
