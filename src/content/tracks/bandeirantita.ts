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
  widthMeters: 12,
  scenery: "highway",
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
