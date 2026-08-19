import type { CarDefinition, CarRuntimeState } from "../domain/car";
import type { HudSkin, HudState } from "../domain/hud";
import type { TrackDefinition } from "../domain/track";

export interface RenderedCar {
  readonly definition: CarDefinition;
  readonly state: CarRuntimeState;
  readonly isLocalPlayer: boolean;
}

export interface RaceRenderInput {
  readonly track: TrackDefinition;
  readonly cars: readonly RenderedCar[];
  readonly localPlayerHud: HudState;
  readonly hudSkin: HudSkin;
  readonly countdownSecondsRemaining: number | null;
  readonly raceMessage: string | null;
}

/**
 * Renderer seam (ADR 0001): the race scene is drawn behind this interface so the
 * MVP's 2D top-down Canvas implementation can later be swapped for a WebGL one
 * without touching domain, physics, or networking code.
 */
export interface RaceRenderer {
  renderFrame(input: RaceRenderInput): void;
  resize(width: number, height: number): void;
}
