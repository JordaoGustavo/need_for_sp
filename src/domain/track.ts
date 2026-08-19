/**
 * Domain types for tracks. See ADR 0007: a single Track/TrackDefinition shape covers
 * both raceType ('circuit' and 'drag'); the difference in win/progress logic lives in
 * a RaceRules strategy (src/domain/raceRules.ts), not in a parallel class hierarchy.
 */

export type RaceType = "circuit" | "drag";

export interface Checkpoint {
  readonly id: string;
  /** Distance along the track path, in meters, at which this checkpoint is crossed. */
  readonly distanceMeters: number;
}

/** Control point of a circuit's closed centerline, in meters on the ground plane. */
export interface TrackPathPoint {
  readonly x: number;
  readonly z: number;
}

export interface TrackDefinition {
  readonly id: string;
  readonly displayName: string;
  /** One-line flavor text shown on the track-select screen. */
  readonly description: string;
  readonly raceType: RaceType;
  /** Total length of one pass over the track path, in meters. */
  readonly lengthMeters: number;
  /** Number of laps to complete. Always 1 for 'drag' tracks. */
  readonly laps: number;
  /** Ordered checkpoints a circuit lap must pass through. Empty for 'drag' tracks. */
  readonly checkpoints: readonly Checkpoint[];
  /** Half-width of the drivable path in meters, used for rendering and (later) collision. */
  readonly widthMeters: number;
  /**
   * Closed centerline control points for 'circuit' tracks (scaled by the
   * renderer so the loop length equals lengthMeters). Absent for 'drag'
   * tracks, whose path is a straight line.
   */
  readonly path?: readonly TrackPathPoint[];
}

/** Per-player race progress, updated every tick from CarRuntimeState.distanceMeters. */
export interface RaceProgress {
  readonly playerId: string;
  lapsCompleted: number;
  nextCheckpointIndex: number;
  finished: boolean;
  /** Race-clock time in seconds at which this player finished, if finished. */
  finishTimeSeconds: number | null;
}

export function createInitialRaceProgress(playerId: string): RaceProgress {
  return {
    playerId,
    lapsCompleted: 0,
    nextCheckpointIndex: 0,
    finished: false,
    finishTimeSeconds: null,
  };
}
