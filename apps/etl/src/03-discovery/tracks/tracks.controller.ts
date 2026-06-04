import { Controller, Get, Param } from "@nestjs/common";

import { TracksService } from "./tracks.service";

@Controller("tracks")
export class TracksController {
  constructor(private readonly tracks: TracksService) {}

  @Get()
  tree() {
    return this.tracks.getTracks();
  }

  @Get(":slug/preset")
  preset(@Param("slug") slug: string) {
    return this.tracks.getTrackPreset(slug);
  }

  @Get(":slug/skills")
  contextualSkills(@Param("slug") slug: string) {
    return this.tracks.getContextualSkills(slug);
  }
}
