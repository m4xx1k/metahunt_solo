import type { DrizzleDB } from '../src/tokens';
import { sources } from '../src/schema/sources';

export async function seedSources(db: DrizzleDB): Promise<void> {
  await db
    .insert(sources)
    .values([
      { code: 'djinni', displayName: 'Djinni', baseUrl: 'https://djinni.co' },
      { code: 'dou', displayName: 'DOU', baseUrl: 'https://jobs.dou.ua' },
    ])
    .onConflictDoNothing({ target: sources.code });
}
