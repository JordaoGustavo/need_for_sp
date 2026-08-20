import type { TrackDefinition } from "../../domain/track";
import { BANDEIRANTITA } from "./bandeirantita";
import { IMIGRANTITA } from "./imigrantita";
import { INTERLAGOS } from "./interlagos";
import { NORDSCHLEIFE } from "./nordschleife";

/**
 * Track content registry (ADR 0005): adding a track is adding an entry here —
 * menus and the race screen never hardcode one.
 */
export const TRACKS: readonly TrackDefinition[] = [BANDEIRANTITA, IMIGRANTITA, INTERLAGOS, NORDSCHLEIFE];

export function getTrackById(trackId: string): TrackDefinition | undefined {
  return TRACKS.find((track) => track.id === trackId);
}

export { BANDEIRANTITA, IMIGRANTITA, INTERLAGOS, NORDSCHLEIFE };
