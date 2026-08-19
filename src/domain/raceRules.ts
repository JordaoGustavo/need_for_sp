import type { CarRuntimeState } from "./car";
import type { RaceProgress, TrackDefinition } from "./track";

/**
 * Strategy that turns a car's raw distance-travelled into race progress (laps, checkpoints,
 * finished/not) for a given track. See ADR 0007: the Track shape is shared between raceTypes,
 * only this rule differs. Pure and deterministic so it can run identically on the host
 * (authoritative, ADR 0004) and be unit tested without any rendering or network code.
 */
export interface RaceRules {
  updateProgress(
    progress: RaceProgress,
    carState: CarRuntimeState,
    track: TrackDefinition,
    raceTimeSeconds: number,
  ): RaceProgress;
}

/** Arrancada: a single straight pass, first to reach the track length wins. */
export class DragRaceRules implements RaceRules {
  updateProgress(
    progress: RaceProgress,
    carState: CarRuntimeState,
    track: TrackDefinition,
    raceTimeSeconds: number,
  ): RaceProgress {
    if (progress.finished) {
      return progress;
    }

    const finished = carState.distanceMeters >= track.lengthMeters;

    return {
      ...progress,
      lapsCompleted: finished ? 1 : 0,
      finished,
      finishTimeSeconds: finished ? raceTimeSeconds : progress.finishTimeSeconds,
    };
  }
}

/**
 * Circuito Fechado: a lap only counts once every checkpoint has been passed, in order,
 * during that same lap — crossing the finish distance without them does not advance
 * lapsCompleted. This is what stops a car from short-cutting the track.
 */
export class CircuitRaceRules implements RaceRules {
  updateProgress(
    progress: RaceProgress,
    carState: CarRuntimeState,
    track: TrackDefinition,
    raceTimeSeconds: number,
  ): RaceProgress {
    if (progress.finished) {
      return progress;
    }

    const priorCheckpointIndex = progress.nextCheckpointIndex;
    const lapDistanceMeters = carState.distanceMeters - progress.lapsCompleted * track.lengthMeters;

    let nextCheckpointIndex = priorCheckpointIndex;
    while (
      nextCheckpointIndex < track.checkpoints.length &&
      lapDistanceMeters >= track.checkpoints[nextCheckpointIndex]!.distanceMeters
    ) {
      nextCheckpointIndex++;
    }

    let lapsCompleted = progress.lapsCompleted;
    let finished: boolean = progress.finished;
    let finishTimeSeconds = progress.finishTimeSeconds;

    const allCheckpointsPassedBeforeThisTick = priorCheckpointIndex >= track.checkpoints.length;
    if (allCheckpointsPassedBeforeThisTick && lapDistanceMeters >= track.lengthMeters) {
      lapsCompleted++;
      nextCheckpointIndex = 0;

      if (lapsCompleted >= track.laps) {
        finished = true;
        finishTimeSeconds = finishTimeSeconds ?? raceTimeSeconds;
      }
    }

    return {
      ...progress,
      nextCheckpointIndex,
      lapsCompleted,
      finished,
      finishTimeSeconds,
    };
  }
}

export function createRaceRules(track: TrackDefinition): RaceRules {
  switch (track.raceType) {
    case "drag":
      return new DragRaceRules();
    case "circuit":
      return new CircuitRaceRules();
  }
}
