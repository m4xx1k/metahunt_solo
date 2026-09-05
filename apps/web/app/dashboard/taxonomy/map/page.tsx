import type { Metadata } from "next";

import { taxonomyApi, type MapNodeItem } from "@/lib/api/taxonomy";
import { tracksApi, type TrackDto } from "@/lib/api/tracks";
import { PageBody } from "@/ui/layout/PageBody";
import { PageHeader } from "@/ui/layout/PageHeader";
import { SizePicker } from "./_components/SizePicker";
import { TileGrid } from "./_components/TileGrid";
import { TrackPicker } from "./_components/TrackPicker";
import { parseMapPageState } from "./_lib/map-page-state";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Taxonomy map" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// The curation map: one direction's top-N skill tiles, sized by within-track
// demand and coloured by `kind`. Sits alongside the curator list (../page.tsx),
// not replacing it. All state is in the URL (?track=&size=).
export default async function TaxonomyMapPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { track, size } = parseMapPageState(sp);

  const [tracksRes, tiles] = await Promise.all([
    tracksApi.get().catch((): { tracks: TrackDto[] } => ({ tracks: [] })),
    taxonomyApi.map({ track, limit: size }).catch((): MapNodeItem[] => []),
  ]);

  return (
    <>
      <PageHeader
        title="Taxonomy map"
        hint="skill tiles by within-track demand · click to classify"
      />

      <PageBody>
        <div className="flex flex-col gap-3">
          <TrackPicker tracks={tracksRes.tracks} selected={track} />
          <SizePicker size={size} />
        </div>

        <TileGrid key={`${track}:${size}`} tiles={tiles} />
      </PageBody>
    </>
  );
}
