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

/** Control point of a track's centerline, in meters on the ground plane. */
export interface TrackPathPoint {
  readonly x: number;
  readonly z: number;
}

/** Surroundings the renderer builds along the track. */
export type TrackScenery = "city" | "highway" | "serra" | "autodromo";

/** A tunnel section carved along the path (e.g. the Imigrantes serra tunnels). */
export interface TrackTunnel {
  readonly startMeters: number;
  readonly endMeters: number;
}

/** Elevation profile key point: road height (visual) at a distance along the path. */
export interface TrackElevationPoint {
  readonly atMeters: number;
  readonly yMeters: number;
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
   * Drivable run-off beyond the asphalt on each side, in meters (kerbs +
   * grass). Cars may use it — kerbs are free, grass scrubs speed — before
   * hitting the real barrier. 0/absent = walls right at the asphalt edge.
   */
  readonly runoffMeters?: number;
  readonly scenery: TrackScenery;
  /**
   * Centerline control points, scaled by the renderer so the path length
   * equals lengthMeters. Closed loop for 'circuit' tracks; open polyline for
   * curved 'drag' runs. Absent = a straight line.
   */
  readonly path?: readonly TrackPathPoint[];
  /** Tunnel sections along the path (serra tracks). */
  readonly tunnels?: readonly TrackTunnel[];
  /** Traffic lanes drawn on the road surface (default 2 = one center dash line). */
  readonly lanes?: number;
  /**
   * Road elevation along the path, interpolated between points (default flat).
   * Purely visual: where the road runs high above the ground, the renderer
   * builds viaduct pillars — the "highway above the forest" of the SP-160.
   */
  readonly elevation?: readonly TrackElevationPoint[];
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
