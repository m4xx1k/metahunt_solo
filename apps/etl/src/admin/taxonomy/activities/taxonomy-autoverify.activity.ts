import { Injectable, Logger } from "@nestjs/common";
import { Activity, ActivityMethod } from "nestjs-temporal-core";

import { TaxonomyService } from "../taxonomy.service";

// One activity == one promotion pass. The UPDATE is a single statement and
// idempotent (already-VERIFIED rows no longer match), so a retry or an
// overlapping schedule fire is harmless.
@Injectable()
@Activity()
export class TaxonomyAutoverifyActivity {
  private readonly logger = new Logger(TaxonomyAutoverifyActivity.name);

  constructor(private readonly taxonomy: TaxonomyService) {}

  @ActivityMethod()
  async taxonomyAutoverify(): Promise<void> {
    const { promoted } = await this.taxonomy.autoVerifySkills();
    if (promoted.length === 0) {
      this.logger.log("taxonomy autoverify — nothing to promote");
      return;
    }
    this.logger.log(
      `taxonomy autoverify — promoted=${promoted.length}: ${promoted.join(", ")}`,
    );
  }
}
