import { Inject, Injectable, Logger } from "@nestjs/common";
import { isNotNull } from "drizzle-orm";
import { Activity, ActivityMethod } from "nestjs-temporal-core";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

export interface RemoteSourceRef {
  id: string;
  code: string;
}

@Injectable()
@Activity()
export class RssListSourcesActivity {
  private readonly logger = new Logger(RssListSourcesActivity.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  @ActivityMethod()
  async listRemoteSources(): Promise<RemoteSourceRef[]> {
    const rows = await this.db
      .select({ id: schema.sources.id, code: schema.sources.code })
      .from(schema.sources)
      .where(isNotNull(schema.sources.rssUrl))
      .execute();
    this.logger.log(
      `listRemoteSources → ${rows.length} source(s): ${rows
        .map((r) => r.code)
        .join(", ")}`,
    );
    return rows;
  }
}
