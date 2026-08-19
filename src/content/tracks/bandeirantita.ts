import type { TrackDefinition } from "../../domain/track";

/**
 * Bandeirantita — um trecho da Rodovia dos Bandeirantes (SP-348) no planalto:
 * a autoestrada de geometria suave, com curvas amplas de longa distância (não
 * uma reta pura), pista larga e galpões/campos esparsos ao redor.
 */
export const BANDEIRANTITA: TrackDefinition = {
  id: "bandeirantita",
  displayName: "Bandeirantita",
  description: "Trecho da Bandeirantes no planalto: curvas amplas de autoestrada.",
  raceType: "drag",
  lengthMeters: 1500,
  laps: 1,
  checkpoints: [],
  // A Bandeirantes real tem 3+ faixas por sentido — pista larga de autoestrada.
  widthMeters: 16,
  lanes: 4,
  scenery: "highway",
  // Ondulação suave do planalto.
  elevation: [
    { atMeters: 0, yMeters: 0 },
    { atMeters: 350, yMeters: 7 },
    { atMeters: 700, yMeters: 3 },
    { atMeters: 1000, yMeters: 9 },
    { atMeters: 1300, yMeters: 2 },
    { atMeters: 1500, yMeters: 0 },
  ],
  // Gentle sweeping S-curves, like the SP-348 alignment between SP and Jundiaí.
  path: [
    { x: 0, z: 0 },
    { x: 8, z: -160 },
    { x: -22, z: -360 },
    { x: -10, z: -560 },
    { x: 45, z: -760 },
    { x: 60, z: -960 },
    { x: 20, z: -1160 },
    { x: -15, z: -1340 },
    { x: -5, z: -1500 },
  ],
};
