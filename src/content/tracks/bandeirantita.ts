import type { TrackDefinition } from "../../domain/track";

/**
 * Bandeirantita — arrancada (drag) inspirada na Rodovia dos Bandeirantes.
 * The first playable track: 'drag' is the simplest raceType (see ADR 0007).
 */
export const BANDEIRANTITA: TrackDefinition = {
  id: "bandeirantita",
  displayName: "Bandeirantita",
  description: "Arrancada urbana na régua da Bandeirantes: 800m no talo.",
  raceType: "drag",
  lengthMeters: 800,
  laps: 1,
  checkpoints: [],
  widthMeters: 10,
};
