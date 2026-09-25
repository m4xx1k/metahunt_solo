import { Injectable, Logger } from "@nestjs/common";

import { Activity, ActivityMethod } from "nestjs-temporal-core";

import { DedupService } from "../dedup.service";

// One activity == the whole CLI sweep: embed the new vacancies, then rebuild
// each pending one's affected set. Both halves are idempotent (embed by source
// hash, resolve by `deduplicated_at IS NULL`), so a retry or an overlapping
// schedule fire is harmless.
@Injectable()
@Activity()
export class DedupSweepActivity {
  private readonly logger = new Logger(DedupSweepActivity.name);

  constructor(private readonly dedup: DedupService) {}

  @ActivityMethod()
  async dedupSweep(): Promise<void> {
    const embed = await this.dedup.embedAll();
    const resolve = await this.dedup.resolveAll();
    this.logger.log(
      `dedup sweep — embedded=${embed.embedded} skipped=${embed.skipped}; ` +
        `resolved=${resolve.resolved}/${resolve.processed} stale=${resolve.stale}; ` +
        `same_source_violations=${resolve.sameSourceViolations}`,
    );
  }
}
