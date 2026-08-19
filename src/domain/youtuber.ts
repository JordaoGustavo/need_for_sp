import type { CarDefinition } from "./car";

/**
 * A Youtuber owns a Garage of CarDefinitions (see ADR 0005). Menu code iterates this
 * registry — it must never hardcode a specific youtuber or car name.
 */
/**
 * Look of the Mii-style character that stands in for the youtuber on the
 * menu showcase (content data, like everything else in the registry).
 */
export interface YoutuberAvatar {
  readonly skinTone: string;
  readonly hairColor: string;
  /** Shirt color; defaults to the youtuber's themeColor when omitted. */
  readonly shirtColor?: string;
}

export interface YoutuberProfile {
  readonly id: string;
  readonly displayName: string;
  readonly channelHandle: string;
  /** Accent color used by the menu to theme this youtuber's garage screen. */
  readonly themeColor: string;
  readonly avatar: YoutuberAvatar;
  readonly garage: Garage;
}

export interface Garage {
  readonly cars: readonly CarDefinition[];
}
