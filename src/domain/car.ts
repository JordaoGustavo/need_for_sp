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

/**
 * Physical footprint used for collision (physics) — the renderer's meshes are
 * built to these same proportions so what you see is what you hit.
 */
export const CAR_WIDTH_METERS = 1.8;
export const CAR_LENGTH_METERS = 4.3;

/**
 * Content-data description of how a car's engine sounds (ADR 0005 / ADR 0010):
 * the engine audio is synthesized in WebAudio from these parameters, so each
 * car gets a distinct voice without shipping audio files.
 */
export interface CarSoundProfile {
  /** Fundamental oscillator frequency at idle, in Hz. Lower = deeper engine. */
  readonly baseFrequencyHz: number;
  /** How far the second oscillator is detuned, in cents. More = rougher, angrier. */
  readonly detuneCents: number;
  /** Low-pass cutoff multiplier (× fundamental) at full RPM. Higher = brighter/raspier. */
  readonly brightness: number;
}

/**
 * Which real-world silhouette the procedural mesh builder uses:
 * "coupe" = fastback coupe (Civic), "hatch" = boxy hot hatch (Golf),
 * "supra" = long-nosed GT with the tall hoop wing (Supra Mk4),
 * "wagon" = long-roof station wagon (Opala Caravan).
 */
export type BodyStyle = "coupe" | "hatch" | "supra" | "wagon";

/**
 * Reference to a real 3D model asset (GLB under public/models/). Content data,
 * like everything else in CarVisual: the renderer normalizes any model to the
 * physics footprint (CAR_LENGTH_METERS) and repaints the named body materials
 * with CarVisual.color, so swapping a car's model is a data change only.
 */
export interface CarModelRef {
  /** Asset URL, e.g. "/models/r34.glb". */
  readonly url: string;
  /** Yaw applied so the nose points -Z (game forward). Most GLBs face +Z → π. */
  readonly yawRad?: number;
  /**
   * Material names to repaint with CarVisual.color. Omit for models whose
   * livery is baked into a texture (they keep their original paint).
   */
  readonly bodyMaterials?: readonly string[];
  /** Node names to hide (e.g. brand logo meshes). */
  readonly hideNodes?: readonly string[];
}

export interface CarVisual {
  /** Base color, used by the default renderer (hex string, e.g. "#e63946"). */
  readonly color: string;
  /** Display name shown in menu and race HUD. */
  readonly displayName: string;
  readonly bodyStyle: BodyStyle;
  /** Optional accent color (e.g. the GTI's red grille stripe). */
  readonly accentColor?: string;
  /** Optional real 3D model; without it the procedural mesh builder is used. */
  readonly model?: CarModelRef;
}

export interface CarDefinition {
  readonly id: string;
  readonly stats: CarStats;
  readonly visual: CarVisual;
  readonly sound: CarSoundProfile;
  readonly engine: EngineProfile;
}

/**
 * Per-car rev range (content data, researched from the real cars): drives the
 * tachometer scale, the red zone, and how far the engine revs. Not a full
 * engine simulation — the HUD derivation maps speed into [idleRpm, redlineRpm].
 */
export interface EngineProfile {
  /** Resting engine speed. */
  readonly idleRpm: number;
  /** Start of the red zone; also where the needle pegs at full throttle. */
  readonly redlineRpm: number;
  /** Top of the tachometer dial (usually a round number past the redline). */
  readonly maxRpm: number;
}

/** Fallback profile (generic sporty four-cylinder). */
export const DEFAULT_ENGINE_PROFILE: EngineProfile = {
  idleRpm: 800,
  redlineRpm: 6500,
  maxRpm: 8000,
};

/** Player input for a single simulation tick. */
export interface CarInput {
  readonly throttle: boolean;
  readonly brake: boolean;
  /** -1 (left) .. 1 (right). Unused on drag tracks, meaningful on circuit tracks. */
  readonly steer: number;
  /** NOS button held (Shift/Space). Boost logic lives in RaceSession. */
  readonly nitro?: boolean;
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
