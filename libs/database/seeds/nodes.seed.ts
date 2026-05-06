import type { DrizzleDB } from '../src/tokens';
import { nodes, nodeAliases } from '../src/schema';
import nodesData from './data/nodes.json';

type NodeTypeValue = 'ROLE' | 'SKILL' | 'DOMAIN';

type SectionItem = { name: string; aliases: string[] };

export async function seedNodes(db: DrizzleDB): Promise<void> {
  await seedSection(db, 'SKILL', nodesData.skills);
  await seedSection(db, 'DOMAIN', nodesData.domains);
  await seedSection(db, 'ROLE', nodesData.roles);
}

async function seedSection(
  db: DrizzleDB,
  type: NodeTypeValue,
  items: SectionItem[],
): Promise<void> {
  for (const item of items) {
    const canonicalName = item.name.trim();

    const [{ id: nodeId }] = await db
      .insert(nodes)
      .values({ type, canonicalName, status: 'VERIFIED' })
      .onConflictDoUpdate({
        target: [nodes.type, nodes.canonicalName],
        set: { status: 'VERIFIED' },
      })
      .returning({ id: nodes.id });

    const aliasNames = uniqueLower([item.name, ...item.aliases]);
    if (aliasNames.length === 0) continue;

    await db
      .insert(nodeAliases)
      .values(aliasNames.map((name) => ({ name, type, nodeId })))
      .onConflictDoNothing({
        target: [nodeAliases.name, nodeAliases.type],
      });
  }
}

function uniqueLower(values: string[]): string[] {
  return Array.from(
    new Set(values.map((v) => v.trim().toLowerCase()).filter(Boolean)),
  );
}
