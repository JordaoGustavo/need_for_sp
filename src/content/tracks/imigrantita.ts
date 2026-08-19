import type { TrackDefinition } from "../../domain/track";

/**
 * Imigrantita — a descida da serra da Rodovia dos Imigrantes (SP-160): a
 * serpentina de curvas amplas cravada na Mata Atlântica, com os túneis longos
 * escavados na rocha (a pista sul real tem 3 grandes túneis somando +8km) e
 * viadutos sobre a floresta. Aqui: mata fechada, neblina de serra e dois
 * túneis ao longo da descida.
 */
export const IMIGRANTITA: TrackDefinition = {
  id: "imigrantita",
  displayName: "Imigrantita",
  description: "A descida da serra dos Imigrantes: mata fechada, neblina e túneis.",
  raceType: "drag",
  lengthMeters: 2200,
  laps: 1,
  checkpoints: [],
  // Pista larga como a SP-160 real.
  widthMeters: 15,
  lanes: 3,
  scenery: "serra",
  // A descida da serra: começa no alto do planalto e desce ao nível do mar,
  // com os trechos altos virando viadutos sobre a floresta (pilares
  // automáticos onde a pista corre elevada e fora de túnel).
  elevation: [
    { atMeters: 0, yMeters: 56 },
    { atMeters: 380, yMeters: 50 },
    { atMeters: 800, yMeters: 42 },
    { atMeters: 1000, yMeters: 36 },
    { atMeters: 1200, yMeters: 30 },
    { atMeters: 1800, yMeters: 16 },
    { atMeters: 2050, yMeters: 4 },
    { atMeters: 2200, yMeters: 0 },
  ],
  // Serpentine alignment echoing the SP-160 serra descent (see the map: long
  // west-east sweeps down the mountain).
  path: [
    { x: 0, z: 0 },
    { x: -30, z: -200 },
    { x: -110, z: -380 },
    { x: -120, z: -560 },
    { x: -60, z: -720 },
    { x: 40, z: -860 },
    { x: 90, z: -1020 },
    { x: 60, z: -1200 },
    { x: -40, z: -1340 },
    { x: -90, z: -1520 },
    { x: -50, z: -1700 },
    { x: 30, z: -1840 },
    { x: 70, z: -2000 },
    { x: 60, z: -2160 },
  ],
  tunnels: [
    { startMeters: 420, endMeters: 760 },
    { startMeters: 1280, endMeters: 1760 },
  ],
};
