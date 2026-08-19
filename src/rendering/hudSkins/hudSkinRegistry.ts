import type { HudSkin } from "../../domain/hud";
import { DefaultDigitalHudSkin } from "./defaultDigitalHudSkin";
import { CLUSTER_THEMES, NfsuClusterHudSkin } from "./nfsuClusterHudSkin";

/**
 * Catalog of every HudSkin the player can pick (ADR 0006). Entries are
 * factories, not instances: cluster skins are stateful (boost estimation), so
 * each race and each preview canvas needs its own instance.
 */
export interface HudSkinOption {
  readonly id: string;
  readonly displayName: string;
  create(): HudSkin;
}

export const HUD_SKIN_OPTIONS: readonly HudSkinOption[] = [
  ...CLUSTER_THEMES.map((theme) => ({
    id: theme.id,
    displayName: theme.displayName,
    create: () => new NfsuClusterHudSkin(theme),
  })),
  {
    id: "default-digital",
    displayName: "Digital Padrão",
    create: () => new DefaultDigitalHudSkin(),
  },
];

export const DEFAULT_HUD_SKIN_ID = "nfsu-cluster";

/** Unknown/absent ids fall back to the default cluster, so stale saves never break. */
export function createHudSkin(id: string | null): HudSkin {
  const option =
    HUD_SKIN_OPTIONS.find((candidate) => candidate.id === id) ??
    HUD_SKIN_OPTIONS.find((candidate) => candidate.id === DEFAULT_HUD_SKIN_ID) ??
    HUD_SKIN_OPTIONS[0];
  if (!option) throw new Error("No HUD skins registered");
  return option.create();
}
