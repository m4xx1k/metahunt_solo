import { Module } from "@nestjs/common";

import { DedupController } from "./dedup.controller";
import { DedupService } from "./dedup.service";
import { OpenAIEmbeddingsClient } from "./openai-embeddings.client";

@Module({
  controllers: [DedupController],
  providers: [DedupService, OpenAIEmbeddingsClient],
  exports: [DedupService],
})
export class DedupModule {}
