import type { TrackDefinition } from "../../domain/track";
import { NORDSCHLEIFE_ELEVATION, NORDSCHLEIFE_PATH } from "./nordschleifeData";

/**
 * Nürburgring Nordschleife — o Inferno Verde, fiel no desenho: centerline e
 * elevação extraídas de dados reais (OpenStreetMap + EU-DEM, ver
 * scripts/extractNordschleife.ts) a ~1/4 da escala. Todas as curvas famosas
 * estão lá — Hatzenbach, Fuchsröhre, Wehrseifen, Karussell, Hohe Acht,
 * Brünnchen, Döttinger Höhe — e os gradientes reais foram preservados: a
 * descida até Breidscheid e a subida ao Hohe Acht mexem na velocidade de
 * verdade (física de gradiente).
 */
export const NORDSCHLEIFE: TrackDefinition = {
  id: "nordschleife",
  displayName: "Nordschleife",
  description: "O Inferno Verde em escala SP: 5 km de floresta, Karussell e 70 m de desnível.",
  raceType: "circuit",
  lengthMeters: 5000,
  laps: 1,
  // Famous sectors as distance gates (from NORDSCHLEIFE_LANDMARKS).
  checkpoints: [
    { id: "flugplatz", distanceMeters: 769 },
    { id: "wehrseifen", distanceMeters: 1851 },
    { id: "bergwerk", distanceMeters: 2212 },
    { id: "karussell", distanceMeters: 2957 },
    { id: "bruennchen", distanceMeters: 3678 },
    { id: "doettinger-hoehe", distanceMeters: 4495 },
  ],
  // Narrower than Interlagos (13) — the real thing is famously tight — and an
  // unforgiving runoff: 1.5 m of free kerb, 1.5 m of grass, then armco.
  widthMeters: 11,
  runoffMeters: 3,
  scenery: "floresta",
  // The extractor already relaxed the data (27 m min radius); the default 4
  // smoothing passes would mush the hairpins it carefully preserved.
  pathSmoothingPasses: 1,
  path: NORDSCHLEIFE_PATH,
  elevation: NORDSCHLEIFE_ELEVATION,
};
