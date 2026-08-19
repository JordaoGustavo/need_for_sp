/**
 * HudSkin is the swappable contract requested by the user for a future "trocar hub do
 * conta-giros/velocímetro" feature (ADR 0006). A HudSkin only ever receives HudState —
 * it never touches CarRuntimeState, physics, or networking directly, so a new skin can
 * be dropped in without knowing anything about how that state was produced.
 */
export interface HudState {
  readonly speedKmh: number;
  readonly rpm: number;
  /** Top of the tachometer dial. */
  readonly maxRpm: number;
  /** Start of the red zone on the dial. */
  readonly redlineRpm: number;
  readonly gear: number;
  /** NOS bottle left (0..1) — one charge per race, never refills. */
  readonly nitroRemaining: number;
  /** Engine heat from continuous NOS use (0..1); at 1 the engine blows. */
  readonly nitroHeat: number;
  readonly nitroActive: boolean;
}

export interface HudSkin {
  readonly id: string;
  readonly displayName: string;
  /** Draws the HUD for the current frame onto the given canvas context, within the given rect. */
  render(ctx: CanvasRenderingContext2D, state: HudState, rect: { x: number; y: number; width: number; height: number }): void;
}
