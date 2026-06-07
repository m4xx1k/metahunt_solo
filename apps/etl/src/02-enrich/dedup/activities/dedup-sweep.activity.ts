import { Injectable, Logger } from "@nestjs/common";
import { Activity, ActivityMethod } from "nestjs-temporal-core";

import { DedupService } from "../dedup.service";

// One activity == the whole CLI sweep, run sequentially: embed the new
// vacancies, then resolve them. Both halves are idempotent (embed by source
// hash, resolve by `unique_vacancy_id IS NULL`), so a retry or an overlapping
// schedule fire is harmless — and resolveAll walks chronologically in a single
// pass, which is exactly what keeps near-duplicate siblings in one group.
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
        `resolved=${resolve.processed} assigned=${resolve.assigned}`,
    );
  }
}
