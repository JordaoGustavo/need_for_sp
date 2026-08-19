import type { YoutuberProfile } from "../domain/youtuber";
import { CARS } from "./cars";

/**
 * Youtuber content registry (ADR 0005). This is the data the "select a garage"
 * screen iterates over — no youtuber name is hardcoded in menu components.
 * Only one youtuber ships in the MVP (docs/mvp-spec.md); adding another is
 * adding an entry here.
 */
function carsById(...ids: string[]) {
  return ids.map((id) => {
    const car = CARS.find((c) => c.id === id);
    if (!car) throw new Error(`Unknown car id in garage: ${id}`);
    return car;
  });
}

export const YOUTUBERS: readonly YoutuberProfile[] = [
  {
    id: "sp-street-garage",
    displayName: "SP Street Garage",
    channelHandle: "@spstreetgarage",
    themeColor: "#ff5a1f",
    avatar: { skinTone: "#e8b98a", hairColor: "#14100c" },
    garage: { cars: carsById("civic-turbo", "golf-gti", "supra-drift") },
  },
  {
    // "A garagem JDM mais valiosa do Brasil".
    id: "etnrlz",
    displayName: "ETNRLZ",
    channelHandle: "@etnrlz",
    themeColor: "#3d7bff",
    avatar: { skinTone: "#dfae83", hairColor: "#14100c", shirtColor: "#17181c" },
    garage: { cars: carsById("novo-z", "skyline-r34", "supra-drift") },
  },
  {
    // Ricardo Freitas, fundador da ACF Performance: boné e barba.
    id: "ricardo-acf",
    displayName: "Ricardinho ACF",
    channelHandle: "@ricardoacf",
    themeColor: "#ff6a00",
    avatar: {
      skinTone: "#e8b98a",
      hairColor: "#241a12",
      beardColor: "#241a12",
      capColor: "#141414",
      shirtColor: "#17181c",
    },
    garage: { cars: carsById("chevette-acf", "lancer-evo") },
  },
  {
    // O Alemão: loiro, direto da oficina das Caravans turbo.
    id: "alemao-caravan",
    displayName: "Alemão da Caravan",
    channelHandle: "@alemaodacaravan",
    themeColor: "#d8b04a",
    avatar: { skinTone: "#f0cfae", hairColor: "#e3c46a", shirtColor: "#1f2937" },
    garage: { cars: carsById("caravan-turbo", "comodoro-weber") },
  },
  {
    // Lucas Fontana, do Auto Super: boné vermelho do canal.
    id: "lucas-autosuper",
    displayName: "Lucas Auto Super",
    channelHandle: "@autosuper",
    themeColor: "#c8102e",
    avatar: {
      skinTone: "#dfae83",
      hairColor: "#2c1b10",
      beardColor: "#3a2a1c",
      capColor: "#c8102e",
      shirtColor: "#101215",
    },
    garage: { cars: carsById("gol-glr-turbo", "chevette-supere") },
  },
];

export function getYoutuberById(youtuberId: string): YoutuberProfile | undefined {
  return YOUTUBERS.find((youtuber) => youtuber.id === youtuberId);
}
