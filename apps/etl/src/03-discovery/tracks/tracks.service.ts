import { Injectable, NotFoundException } from "@nestjs/common";

import { presetMatchesNothing, resolveTrackPreset, type TrackPreset } from "./track-preset";
import type {
  ContextualSkillsResponse,
  TrackPresetResponse,
  TracksResponse,
} from "./tracks.contract";
import { TracksRepository } from "./tracks.repository";

// Browse-tree read API: resolves a track to its preset and serves the tree,
// the per-axis preset nodes, and contextual skills. All DB access lives in
// TracksRepository; the inheritance rule stays pure in track-preset.ts.
@Injectable()
export class TracksService {
  constructor(private readonly tracks: TracksRepository) {}

  async getTracks(): Promise<TracksResponse> {
    return { tracks: await this.tracks.findTrackTree() };
  }

  async getTrackPreset(slug: string): Promise<TrackPresetResponse> {
    const preset = await this.resolvePreset(slug);
    if (!preset) throw new NotFoundException(`Unknown trackSlug "${slug}"`);
    return this.tracks.findPresetNodes(preset);
  }

  // Skills common in the track's matched vacancies, minus its own preset skills.
  async getContextualSkills(slug: string): Promise<ContextualSkillsResponse> {
    const preset = await this.resolvePreset(slug);
    if (!preset) throw new NotFoundException(`Unknown trackSlug "${slug}"`);
    if (presetMatchesNothing(preset)) return { skills: [] };
    return { skills: await this.tracks.findContextualSkills(preset) };
  }

  private async resolvePreset(slug: string): Promise<TrackPreset | null> {
    const nodeIds = await this.tracks.findTrackNodeIds(slug);
    return nodeIds ? resolveTrackPreset(nodeIds) : null;
  }
}
