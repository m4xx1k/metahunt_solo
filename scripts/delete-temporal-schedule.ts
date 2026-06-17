/**
 * One-off: delete a Temporal schedule by id. Used to retire schedules whose
 * installing service has been removed from the worker (otherwise the schedule
 * keeps firing a workflow type that's no longer registered → daily failures).
 *
 * Connection mirrors platform/temporal/temporal.module.ts. Reads TEMPORAL_*
 * from env — run with prod creds injected, never inline:
 *
 *   railway run --service @metahunt/etl -- \
 *     npx ts-node --project tsconfig.json scripts/delete-temporal-schedule.ts taxonomy-autoverify
 */
import { Client, Connection, ScheduleNotFoundError } from '@temporalio/client';

async function main(): Promise<void> {
  const scheduleId = process.argv[2];
  if (!scheduleId) throw new Error('usage: delete-temporal-schedule.ts <schedule-id>');

  const address = process.env.TEMPORAL_ADDRESS;
  const namespace = process.env.TEMPORAL_NAMESPACE;
  if (!address || !namespace) {
    throw new Error('TEMPORAL_ADDRESS and TEMPORAL_NAMESPACE must be set');
  }
  const apiKey = process.env.TEMPORAL_API_KEY ?? '';
  const cloud = apiKey.length > 0;

  // eslint-disable-next-line no-console
  console.log(`Temporal: ${address} / ${namespace} (cloud=${cloud})\nDeleting schedule: ${scheduleId}`);

  const connection = await Connection.connect({
    address,
    ...(cloud ? { tls: true, apiKey } : {}),
  });
  const client = new Client({ connection, namespace });

  try {
    await client.schedule.getHandle(scheduleId).delete();
    // eslint-disable-next-line no-console
    console.log('Deleted.');
  } catch (err) {
    if (err instanceof ScheduleNotFoundError) {
      // eslint-disable-next-line no-console
      console.log('Already absent — nothing to do.');
    } else {
      throw err;
    }
  } finally {
    await connection.close();
  }
}

void main();
