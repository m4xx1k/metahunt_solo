import { Injectable, Inject } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { Activity, ActivityMethod } from "nestjs-temporal-core";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

@Injectable()
@Activity()
export class RssFinalizeActivity {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  @ActivityMethod()
  async finalizeIngest(
    ingestId: string,
    status: "completed" | "failed",
    errorMessage?: string,
  ): Promise<void> {
    await this.db
      .update(schema.rssIngests)
      .set({
        status,
        finishedAt: new Date(),
        ...(errorMessage ? { errorMessage } : {}),
      })
      .where(eq(schema.rssIngests.id, ingestId));
  }
}
