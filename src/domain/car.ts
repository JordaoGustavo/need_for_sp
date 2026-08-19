/**
 * Domain types for cars. A CarDefinition is content data (see src/content/cars.ts) —
 * it never contains simulation state. CarRuntimeState is the mutable, per-race state
 * of a car instance on track. Keeping these separate is what lets the same
 * CarDefinition be reused across races, and later, be extended with customization
 * (see ADR 0005) without touching simulation code.
 */

export interface CarStats {
  /** Top speed in km/h. */
  readonly topSpeedKmh: number;
  /** How fast the car accelerates towards top speed, in km/h per second. */
  readonly accelerationKmhPerSec: number;
  /** How fast the car sheds speed under braking, in km/h per second. */
  readonly brakingKmhPerSec: number;
  /** Passive deceleration (engine braking / drag) applied with no input, in km/h per second. */
  readonly dragKmhPerSec: number;
  /** Turn rate at reference speed, in radians per second. Used by circuit-style tracks. */
  readonly turnRateRadPerSec: number;
}

export interface CarVisual {
  /** Base color, used by the default renderer (hex string, e.g. "#e63946"). */
  readonly color: string;
  /** Display name shown in menu and race HUD. */
  readonly displayName: string;
}

export interface CarDefinition {
  readonly id: string;
  readonly stats: CarStats;
  readonly visual: CarVisual;
}

/** Redline used by HUD skins to render the tachometer. Not physically simulated in the MVP. */
export interface EngineProfile {
  readonly maxRpm: number;
  readonly idleRpm: number;
}

export const DEFAULT_ENGINE_PROFILE: EngineProfile = {
  maxRpm: 8000,
  idleRpm: 900,
};

/** Player input for a single simulation tick. */
export interface CarInput {
  readonly throttle: boolean;
  readonly brake: boolean;
  /** -1 (left) .. 1 (right). Unused on drag tracks, meaningful on circuit tracks. */
  readonly steer: number;
}

export const NEUTRAL_INPUT: CarInput = {
  throttle: false,
  brake: false,
  steer: 0,
};

/** Mutable per-race state of one car instance. */
export interface CarRuntimeState {
  readonly carId: string;
  /** Distance travelled along the track's path, in meters. Authoritative progress measure. */
  distanceMeters: number;
  /** Lateral offset from the track centerline, in meters. Used by circuit tracks; 0 on drag tracks. */
  lateralOffsetMeters: number;
  /** Current speed in km/h. */
  speedKmh: number;
  /** Heading in radians, used for rendering only in the MVP (top-down sprite rotation). */
  headingRad: number;
}

export function createInitialCarRuntimeState(carId: string): CarRuntimeState {
  return {
    carId,
    distanceMeters: 0,
    lateralOffsetMeters: 0,
    speedKmh: 0,
    headingRad: 0,
  };
}
