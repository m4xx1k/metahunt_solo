import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "./schema";

export const DRIZZLE = Symbol("DRIZZLE");
export type DrizzleDB = NodePgDatabase<typeof schema>;

// The handle `db.transaction(cb)` hands its callback. A method that may need to
// run inside a caller's transaction takes `DrizzleExecutor` — checking out a
// second pooled connection while the caller holds one risks exhausting the pool.
export type DrizzleTx = Parameters<Parameters<DrizzleDB["transaction"]>[0]>[0];
export type DrizzleExecutor = DrizzleDB | DrizzleTx;
