import type { CarInput, CarRuntimeState, CarStats } from "../domain/car";

const KMH_TO_MS = 1 / 3.6;

/**
 * Advances a car's runtime state by `dtSeconds`, given its stats and the input for this tick.
 * Pure function: same inputs always produce the same output. This is what both the local
 * (predicted) simulation and, in a future server-authoritative mode, a trusted simulation
 * would call — keeping it pure and side-effect-free makes it trivially testable and reusable.
 */
export function stepCarPhysics(
  state: CarRuntimeState,
  stats: CarStats,
  input: CarInput,
  dtSeconds: number,
): CarRuntimeState {
  const nextSpeedKmh = computeNextSpeed(state.speedKmh, stats, input, dtSeconds);

  const avgSpeedMs = ((state.speedKmh + nextSpeedKmh) / 2) * KMH_TO_MS;
  const distanceMeters = state.distanceMeters + avgSpeedMs * dtSeconds;

  const speedMs = nextSpeedKmh * KMH_TO_MS;
  const lateralOffsetMeters =
    state.lateralOffsetMeters + input.steer * stats.turnRateRadPerSec * speedMs * 0.1 * dtSeconds;

  const headingRad = state.headingRad + input.steer * stats.turnRateRadPerSec * dtSeconds;

  return {
    carId: state.carId,
    distanceMeters,
    lateralOffsetMeters,
    speedKmh: nextSpeedKmh,
    headingRad,
  };
}

function computeNextSpeed(
  currentSpeedKmh: number,
  stats: CarStats,
  input: CarInput,
  dtSeconds: number,
): number {
  let speed = currentSpeedKmh;

  if (input.brake) {
    speed -= stats.brakingKmhPerSec * dtSeconds;
  } else if (input.throttle) {
    speed += stats.accelerationKmhPerSec * dtSeconds;
  } else {
    speed -= stats.dragKmhPerSec * dtSeconds;
  }

  return clamp(speed, 0, stats.topSpeedKmh);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
