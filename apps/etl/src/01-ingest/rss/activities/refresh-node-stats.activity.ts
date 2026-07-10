import { Injectable, Inject, Logger } from "@nestjs/common";

import { sql } from "drizzle-orm";
import { Activity, ActivityMethod } from "nestjs-temporal-core";

import { DRIZZLE } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

// Refresh the reverse-ATS IDF view at the end of an ingest run. `node_stats`
// derives df/weight from `vacancy_nodes`, which the silver-layer load keeps
// growing; refreshing here picks up everything committed so far (the per-
// vacancy load children are fire-and-forget, so the view lags by ≤1 ingest
// cycle — fine for IDF stats that barely move hour-to-hour).
// CONCURRENTLY keeps the matcher/feed readable during the rebuild (it requires
// the unique index on node_id, added alongside the view in migration 0015).
@Injectable()
@Activity()
export class RefreshNodeStatsActivity {
  private readonly logger = new Logger(RefreshNodeStatsActivity.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  @ActivityMethod()
  async refreshNodeStats(): Promise<void> {
    await this.db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY node_stats`);
    // node_skill_cooc rides the same cadence — it derives from vacancy_nodes too
    // and feeds the recommendation substitute-gate. Plain REFRESH (no unique
    // index); a brief read-lock here is fine at ingest-tail frequency.
    await this.db.execute(sql`REFRESH MATERIALIZED VIEW node_skill_cooc`);
    this.logger.log("Refreshed node_stats + node_skill_cooc materialized views");
  }
}
