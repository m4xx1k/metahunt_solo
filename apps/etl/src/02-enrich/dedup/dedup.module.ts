import { Module } from "@nestjs/common";

import { AuthModule } from "../../platform/auth/auth.module";

import { DEDUP_ACTIVITIES } from "./activities";
import { DedupSchedulerService } from "./dedup-scheduler.service";
import { DedupController } from "./dedup.controller";
import { DedupService } from "./dedup.service";
import { OpenAIEmbeddingsClient } from "./openai-embeddings.client";

@Module({
  imports: [AuthModule],
  controllers: [DedupController],
  // Activities are listed as Nest providers so the container can resolve them
  // when the Temporal worker instantiates them (the worker registers the same
  // classes via temporal.module's activityClasses).
  providers: [DedupService, OpenAIEmbeddingsClient, DedupSchedulerService, ...DEDUP_ACTIVITIES],
  exports: [DedupService],
})
export class DedupModule {}
