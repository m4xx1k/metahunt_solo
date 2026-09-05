import { firstSearchParam, type SearchParamValue } from "@/lib/search-params";

export const MAP_SIZES = [50, 150, 300] as const;
export type MapSize = (typeof MAP_SIZES)[number];

export const DEFAULT_MAP_SIZE: MapSize = 150;
export const DEFAULT_MAP_TRACK = "backend";

export interface MapPageState {
  track: string;
  size: MapSize;
}

export function parseMapPageState(params: Record<string, SearchParamValue>): MapPageState {
  return {
    track: firstSearchParam(params.track)?.trim() || DEFAULT_MAP_TRACK,
    size: parseSize(firstSearchParam(params.size)),
  };
}

function parseSize(raw: string | undefined): MapSize {
  const n = Number(raw);
  return (MAP_SIZES as readonly number[]).includes(n) ? (n as MapSize) : DEFAULT_MAP_SIZE;
}
