import { Inject, Injectable, Logger } from "@nestjs/common";

import { sql } from "drizzle-orm";
import { Activity, ActivityMethod } from "nestjs-temporal-core";

import { DRIZZLE } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

@Injectable()
@Activity()
export class CaptureMarketSnapshotActivity {
  private readonly logger = new Logger(CaptureMarketSnapshotActivity.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  @ActivityMethod()
  async captureMarketSnapshot(): Promise<{ snapshotId: string; positions: number }> {
    const snapshot = await this.db.transaction(async (tx) => {
      const header = await tx.execute<{
        id: string;
        position_count: number;
      }>(sql`
        INSERT INTO market_snapshots (position_count, position_node_count)
        SELECT count(*)::int,
               (SELECT count(*)::int FROM position_nodes)
        FROM positions
        RETURNING id::text, position_count
      `);
      const row = header.rows[0];
      if (!row) throw new Error("market snapshot header was not created");

      await tx.execute(sql`
        INSERT INTO market_snapshot_positions (snapshot_id, position_id, position)
        SELECT ${row.id}::uuid, p.position_id, to_jsonb(p)
        FROM positions p
      `);
      await tx.execute(sql`
        INSERT INTO market_snapshot_position_nodes (snapshot_id, position_id, node_id, is_required)
        SELECT ${row.id}::uuid, pn.position_id, pn.node_id, pn.is_required
        FROM position_nodes pn
      `);
      return { snapshotId: row.id, positions: row.position_count };
    });

    this.logger.log(
      `Captured market snapshot ${snapshot.snapshotId} (${snapshot.positions} positions)`,
    );
    return snapshot;
  }
}
