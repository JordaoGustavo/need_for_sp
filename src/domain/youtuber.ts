import type { CarDefinition } from "./car";

/**
 * A Youtuber owns a Garage of CarDefinitions (see ADR 0005). Menu code iterates this
 * registry — it must never hardcode a specific youtuber or car name.
 */
export interface YoutuberProfile {
  readonly id: string;
  readonly displayName: string;
  readonly channelHandle: string;
  /** Accent color used by the menu to theme this youtuber's garage screen. */
  readonly themeColor: string;
  readonly garage: Garage;
}

export interface Garage {
  readonly cars: readonly CarDefinition[];
}
