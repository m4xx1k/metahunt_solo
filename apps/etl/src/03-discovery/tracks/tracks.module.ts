import { Module } from "@nestjs/common";

import { TracksController } from "./tracks.controller";
import { TracksRepository } from "./tracks.repository";
import { TracksService } from "./tracks.service";

@Module({
  providers: [TracksService, TracksRepository],
  controllers: [TracksController],
})
export class TracksModule {}
