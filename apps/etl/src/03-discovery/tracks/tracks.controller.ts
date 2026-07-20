import { Controller, Get, Param } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

import { TracksService } from "./tracks.service";

@Controller("tracks")
@ApiTags("tracks")
export class TracksController {
  constructor(private readonly tracks: TracksService) {}

  @Get()
  @ApiOperation({ summary: "List navigable career tracks" })
  @ApiOkResponse({ description: "Career-track tree." })
  tree() {
    return this.tracks.getTracks();
  }

  @Get(":slug/preset")
  @ApiOperation({ summary: "Read the filter preset for a track" })
  @ApiOkResponse({ description: "Track filter preset." })
  preset(@Param("slug") slug: string) {
    return this.tracks.getTrackPreset(slug);
  }

  @Get(":slug/skills")
  @ApiOperation({ summary: "List contextual skills for a track" })
  @ApiOkResponse({ description: "Track skill facets." })
  contextualSkills(@Param("slug") slug: string) {
    return this.tracks.getContextualSkills(slug);
  }
}
