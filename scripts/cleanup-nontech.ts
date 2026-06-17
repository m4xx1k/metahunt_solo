/**
 * One-time cleanup of historical non-tech vacancies that slipped the OLD
 * (buggy) ingest filter. Re-runs the FIXED Gate 1 (`passesTechGate`) over every
 * stored row and deletes the blacklist hits — bringing prod in line with what
 * the fixed gate would have ingested. Going forward, Gate 1 (ingest) and Gate 2
 * (LLM `isTech` in the loader) hard-skip junk, so nothing new accumulates.
 *
 *   DRY RUN (default):  npx ts-node --project tsconfig.json scripts/cleanup-nontech.ts
 *   APPLY:              npx ts-node --project tsconfig.json scripts/cleanup-nontech.ts --apply
 *
 * `vacancies` has two RESTRICT children that block a delete; the script reports
 * and handles them inside one transaction:
 *   - sent_notifications.vacancy_id        → deleted first
 *   - unique_vacancies.canonical_vacancy_id → if the junk row is a group's
 *     canonical, the whole group is deleted (members SET NULL via the FK)
 *   - vacancy_nodes.vacancy_id             → ON DELETE CASCADE (automatic)
 *
 * Reads DATABASE_URL from env.
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { passesTechGate } from '../apps/etl/src/01-ingest/rss/utils/vacancy-filter';

interface Row {
  id: string;
  title: string;
}

const apply = process.argv.slice(2).includes('--apply');

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const target = connectionString.replace(/:\/\/([^:]+):[^@]+@/, '://$1:***@');
  // eslint-disable-next-line no-console
  console.log(`\nDB: ${target}\napply=${apply}\n`);

  const pool = new Pool({ connectionString });
  try {
    const { rows } = await pool.query<Row>('SELECT id, title FROM vacancies');
    const junk = rows.filter(
      (r) => passesTechGate({ title: r.title }).stage === 'blacklist',
    );
    const ids = junk.map((r) => r.id);
    // eslint-disable-next-line no-console
    console.log(`Blacklist junk to delete: ${junk.length} of ${rows.length}`);

    if (ids.length === 0) return;

    // FK blocker recon
    const { rows: notif } = await pool.query<{ count: string }>(
      'SELECT count(*)::text FROM sent_notifications WHERE vacancy_id = ANY($1::uuid[])',
      [ids],
    );
    const { rows: canon } = await pool.query<{ id: string }>(
      'SELECT id FROM unique_vacancies WHERE canonical_vacancy_id = ANY($1::uuid[])',
      [ids],
    );
    const { rows: members } = await pool.query<{ count: string }>(
      'SELECT count(*)::text FROM vacancies WHERE id = ANY($1::uuid[]) AND unique_vacancy_id IS NOT NULL',
      [ids],
    );
    // eslint-disable-next-line no-console
    console.log(
      `  sent_notifications rows to clear: ${notif[0].count}\n` +
        `  junk rows that are a dedup-group canonical: ${canon.length}\n` +
        `  junk rows that are a (non-canonical) group member: ${members[0].count}`,
    );

    // eslint-disable-next-line no-console
    console.log('\nSample:');
    for (const r of junk.slice(0, 20)) {
      // eslint-disable-next-line no-console
      console.log(`  - ${r.title.replace(/\s+/g, ' ').slice(0, 80)}`);
    }

    if (!apply) {
      // eslint-disable-next-line no-console
      console.log('\nDRY RUN — nothing deleted. Re-run with --apply to commit.');
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'DELETE FROM sent_notifications WHERE vacancy_id = ANY($1::uuid[])',
        [ids],
      );
      // Drop dedup groups these rows are canonical of; surviving members
      // (vacancies.unique_vacancy_id) detach via that FK's ON DELETE SET NULL.
      const canonIds = canon.map((c) => c.id);
      if (canonIds.length) {
        await client.query(
          'DELETE FROM unique_vacancies WHERE id = ANY($1::uuid[])',
          [canonIds],
        );
      }
      const del = await client.query(
        'DELETE FROM vacancies WHERE id = ANY($1::uuid[])',
        [ids],
      );
      await client.query('COMMIT');
      // eslint-disable-next-line no-console
      console.log(`\nAPPLIED — deleted ${del.rowCount} vacancies.`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

void main();
