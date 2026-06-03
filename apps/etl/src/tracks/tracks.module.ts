import { Module } from "@nestjs/common";

import { TracksController } from "./tracks.controller";
import { TracksService } from "./tracks.service";
import { TracksRepository } from "./tracks.repository";

@Module({
  providers: [TracksService, TracksRepository],
  controllers: [TracksController],
})
export class TracksModule {}
