import type { TrackDefinition } from "../../domain/track";

/**
 * Imigrantita — arrancada longa inspirada na Rodovia dos Imigrantes: a reta
 * que desce a serra rumo ao litoral. Mais comprida e um pouco mais larga que
 * a Bandeirantita, favorecendo velocidade final sobre largada.
 */
export const IMIGRANTITA: TrackDefinition = {
  id: "imigrantita",
  displayName: "Imigrantita",
  description: "A descida da serra dos Imigrantes: 1.4km para esticar a sexta.",
  raceType: "drag",
  lengthMeters: 1400,
  laps: 1,
  checkpoints: [],
  widthMeters: 12,
};
