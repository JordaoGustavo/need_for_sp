import type { TrackDefinition } from "../../domain/track";

/**
 * Bandeirantita — arrancada (drag) inspirada na Rodovia Bandeirantes. Chosen as the
 * first playable track because 'drag' is the simplest raceType to implement correctly
 * (see docs/mvp-spec.md and ADR 0007): single pass, no laps, no checkpoints.
 */
export const BANDEIRANTITA: TrackDefinition = {
  id: "bandeirantita",
  displayName: "Bandeirantita",
  raceType: "drag",
  lengthMeters: 800,
  laps: 1,
  checkpoints: [],
  widthMeters: 10,
};

export const TRACKS: readonly TrackDefinition[] = [BANDEIRANTITA];

export function getTrackById(trackId: string): TrackDefinition | undefined {
  return TRACKS.find((track) => track.id === trackId);
}
