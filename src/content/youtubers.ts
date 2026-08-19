import type { YoutuberProfile } from "../domain/youtuber";
import { CARS } from "./cars";

/**
 * Youtuber content registry (ADR 0005). This is the data the "select a garage"
 * screen iterates over — no youtuber name is hardcoded in menu components.
 * Only one youtuber ships in the MVP (docs/mvp-spec.md); adding another is
 * adding an entry here.
 */
export const YOUTUBERS: readonly YoutuberProfile[] = [
  {
    id: "sp-street-garage",
    displayName: "SP Street Garage",
    channelHandle: "@spstreetgarage",
    themeColor: "#ff5a1f",
    garage: { cars: CARS },
  },
];

export function getYoutuberById(youtuberId: string): YoutuberProfile | undefined {
  return YOUTUBERS.find((youtuber) => youtuber.id === youtuberId);
}
