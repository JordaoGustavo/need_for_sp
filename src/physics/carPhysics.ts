import type { CarInput, CarRuntimeState, CarStats } from "../domain/car";
import { CAR_LENGTH_METERS, CAR_WIDTH_METERS } from "../domain/car";

const KMH_TO_MS = 1 / 3.6;

/** Speed scrubbed off while grinding along a track barrier, in km/h per second. */
const WALL_SCRUB_KMH_PER_SEC = 90;

/** Reverse gear tops out here — enough to maneuver, useless for racing. */
const REVERSE_TOP_SPEED_KMH = 30;

/**
 * Gravity along the road, in km/h per second per unit of slope (dY/dDistance).
 * Physical value: g · 3.6 ≈ 35 — a 10% grade drains/adds ~3.5 km/h each second.
 */
export const SLOPE_ACCEL_KMH_PER_SEC = 35;

/**
 * Past the finish line the runoff area ends in a barrier at this distance.
 * Sized so the post-finish auto-brake stops every car with margin to spare
 * (worst case: Supra from 245 km/h needs ~82m at 2.2× its braking stat).
 */
export const TRACK_END_RUNOFF_METERS = 90;
/** Backing up before the start line hits a wall this far behind it. */
const TRACK_START_BACKSTOP_METERS = -8;

/**
 * Advances a car's runtime state by `dtSeconds`, given its stats and the input for this tick.
 * Pure function: same inputs always produce the same output.
 *
 * Movement is a simple bicycle model, so the car handles like a car:
 * - Steering changes the heading (yaw); the car travels where the nose points.
 *   Yaw authority builds with speed (a parked car can't turn) and tightens at
 *   high speed for stability; in reverse the yaw inverts, like real steering.
 * - The heading persists until steered back — no auto-centering rails.
 * - Braking past a stop engages reverse, capped at walking pace.
 *
 * `pathCurvatureRadPerMeter` is the track centerline's curvature at the car's
 * position. State lives in path coordinates (distance + lateral), where the
 * road itself bends — subtracting the curvature's yaw keeps the car's WORLD
 * heading constant unless the driver steers. The driver chooses the line
 * through every corner; nobody gets pulled around a curve for free.
 *
 * `pathSlope` is the road's grade at the car (dY/dDistance, positive uphill):
 * climbs bleed speed and descents feed it, on top of the engine/brake forces.
 */
export function stepCarPhysics(
  state: CarRuntimeState,
  stats: CarStats,
  input: CarInput,
  dtSeconds: number,
  pathCurvatureRadPerMeter = 0,
  pathSlope = 0,
): CarRuntimeState {
  const nextSpeedKmh = computeNextSpeed(state.speedKmh, stats, input, dtSeconds, pathSlope);

  const speedMs = nextSpeedKmh * KMH_TO_MS;
  const speedAbsMs = Math.abs(speedMs);
  // No yaw when parked, full agility by ~30 km/h, progressively calmer beyond.
  const steerAuthority = Math.min(1, speedAbsMs / 8) / (1 + speedAbsMs / 45);
  const reverseFactor = nextSpeedKmh < 0 ? -1 : 1;
  const steeredHeadingRad =
    state.headingRad + input.steer * stats.turnRateRadPerSec * steerAuthority * reverseFactor * dtSeconds;

  const avgSpeedMs = ((state.speedKmh + nextSpeedKmh) / 2) * KMH_TO_MS;
  const forwardDeltaMeters = Math.cos(steeredHeadingRad) * avgSpeedMs * dtSeconds;
  // The road turned under the car; un-turn the relative heading by the same amount.
  const headingRad = steeredHeadingRad - pathCurvatureRadPerMeter * forwardDeltaMeters;

  const distanceMeters = state.distanceMeters + forwardDeltaMeters;
  const lateralOffsetMeters = state.lateralOffsetMeters + Math.sin(headingRad) * avgSpeedMs * dtSeconds;

  return {
    carId: state.carId,
    distanceMeters,
    lateralOffsetMeters,
    speedKmh: nextSpeedKmh,
    headingRad,
  };
}

/** Kerb width beyond the asphalt that can be used penalty-free, in meters. */
const KERB_FREE_METERS = 1.5;
/**
 * Grass drag is PROPORTIONAL to speed (rolling resistance), per second: it
 * scrubs hard when you fly off at 200 km/h (~90 km/h/s) but never overpowers
 * the engine at crawling pace — you can always drive/reverse off the grass.
 */
const GRASS_DRAG_RATE_PER_SEC = 0.45;

/**
 * Collides the car with the track's side limits. With `runoffExtraMeters` the
 * asphalt is not a wall: kerbs (first KERB_FREE_METERS) can be abused freely,
 * the grass beyond drags speed down, and only the barrier at the end of the
 * run-off is a hard clamp that grinds speed off. Pure, like stepCarPhysics.
 */
export function applyTrackBoundaryCollision(
  state: CarRuntimeState,
  trackWidthMeters: number,
  dtSeconds: number,
  runoffExtraMeters = 0,
): CarRuntimeState {
  const asphaltHalf = trackWidthMeters / 2;
  const maxLateral = asphaltHalf + runoffExtraMeters - CAR_WIDTH_METERS / 2;
  const absLateral = Math.abs(state.lateralOffsetMeters);

  if (absLateral > maxLateral) {
    const scrubbed = Math.max(0, Math.abs(state.speedKmh) - WALL_SCRUB_KMH_PER_SEC * dtSeconds);
    return {
      ...state,
      lateralOffsetMeters: Math.sign(state.lateralOffsetMeters) * maxLateral,
      speedKmh: Math.sign(state.speedKmh) * scrubbed,
    };
  }

  // On the grass (past the free kerb strip): the run-off punishes, gently.
  if (runoffExtraMeters > 0 && absLateral > asphaltHalf - CAR_WIDTH_METERS / 2 + KERB_FREE_METERS) {
    const dragged = Math.abs(state.speedKmh) * Math.max(0, 1 - GRASS_DRAG_RATE_PER_SEC * dtSeconds);
    return { ...state, speedKmh: Math.sign(state.speedKmh) * dragged };
  }

  return state;
}

/** How much speed survives (reversed) when crashing into an end wall. */
const WALL_RESTITUTION = 0.25;
/** Bounce-back is capped so a 200km/h crash doesn't launch the car in reverse. */
const MAX_BOUNCE_KMH = 25;

/**
 * Physical walls at both ends of the strip: the barrier past the finish-line
 * runoff and the backstop behind the start line. Hitting one is a crash — the
 * car bounces back with a fraction of its speed, not a scripted dead stop.
 */
export function applyTrackLimits(
  state: CarRuntimeState,
  trackLengthMeters: number,
): CarRuntimeState {
  const endMeters = trackLengthMeters + TRACK_END_RUNOFF_METERS;
  if (state.distanceMeters > endMeters) {
    const bounce = state.speedKmh > 0 ? Math.max(-MAX_BOUNCE_KMH, -state.speedKmh * WALL_RESTITUTION) : state.speedKmh;
    return { ...state, distanceMeters: endMeters, speedKmh: bounce };
  }
  if (state.distanceMeters < TRACK_START_BACKSTOP_METERS) {
    const bounce = state.speedKmh < 0 ? Math.min(MAX_BOUNCE_KMH, -state.speedKmh * WALL_RESTITUTION) : state.speedKmh;
    return { ...state, distanceMeters: TRACK_START_BACKSTOP_METERS, speedKmh: bounce };
  }
  return state;
}

/**
 * Resolves overlap between the local car and the (interpolated) remote car.
 * Each peer only ever corrects its OWN car — both sides run this symmetric rule
 * against the other's reported position, so no extra network traffic is needed
 * (consistent with the client-predicted movement model of ADR 0004).
 *
 * Cars are boxes in (distance, lateral) space. On overlap, the car is pushed out
 * along the axis of least penetration: sideways scrapes push laterally; rear-end
 * hits stop the bumper at the other car and cap speed to the car in front's.
 */
export function resolveCarCollision(
  local: CarRuntimeState,
  remote: CarRuntimeState,
): CarRuntimeState {
  const deltaDistance = local.distanceMeters - remote.distanceMeters;
  const deltaLateral = local.lateralOffsetMeters - remote.lateralOffsetMeters;

  const overlapLong = CAR_LENGTH_METERS - Math.abs(deltaDistance);
  const overlapLat = CAR_WIDTH_METERS - Math.abs(deltaLateral);
  if (overlapLong <= 0 || overlapLat <= 0) return local;

  if (overlapLat <= overlapLong) {
    // Side scrape: push out laterally (away from the remote car).
    const push = Math.sign(deltaLateral || 1) * overlapLat;
    return { ...local, lateralOffsetMeters: local.lateralOffsetMeters + push };
  }

  if (deltaDistance < 0) {
    // Local car rear-ended the remote: stop at its bumper, lose the speed advantage.
    return {
      ...local,
      distanceMeters: remote.distanceMeters - CAR_LENGTH_METERS,
      speedKmh: Math.min(local.speedKmh, remote.speedKmh),
    };
  }

  // Remote car ran into the local car's rear: get nudged forward, no speed change
  // (the other peer's own simulation handles slowing *their* car down).
  return { ...local, distanceMeters: remote.distanceMeters + CAR_LENGTH_METERS };
}

/**
 * Speed integration with a real-car feel:
 * - Under throttle, acceleration is `accelerationKmhPerSec` at standstill and
 *   tapers with the square of speed (power fighting aero drag), reaching zero
 *   at top speed — so top speed is approached, not slammed into.
 * - Coasting drag grows with speed and always pulls toward zero.
 * - Braking is constant; braking through a stop engages reverse.
 */
function computeNextSpeed(
  currentSpeedKmh: number,
  stats: CarStats,
  input: CarInput,
  dtSeconds: number,
  pathSlope: number,
): number {
  let speed = currentSpeedKmh;

  if (input.throttle) {
    const forwardFraction = clamp(Math.max(0, speed) / stats.topSpeedKmh, 0, 1);
    const powerTaper = 1 - forwardFraction * forwardFraction;
    speed += stats.accelerationKmhPerSec * powerTaper * dtSeconds;
  } else if (input.brake) {
    if (speed > 0) {
      speed = Math.max(0, speed - stats.brakingKmhPerSec * dtSeconds);
    } else {
      // Already stopped (or reversing): back up with real grunt — enough to
      // pull the car out of grass and away from walls.
      speed -= stats.accelerationKmhPerSec * 0.8 * dtSeconds;
    }
  } else {
    const speedFraction = clamp(Math.abs(speed) / stats.topSpeedKmh, 0, 1);
    const coastDrag = stats.dragKmhPerSec * (0.3 + 0.7 * speedFraction) * dtSeconds;
    speed = Math.abs(speed) <= coastDrag ? 0 : speed - Math.sign(speed) * coastDrag;
  }

  // Gravity along the road: acts on the signed speed, so it also pushes a
  // stationary car backward down a steep grade. (The coast branch's snap-to-
  // zero doubles as a weak parking brake on gentle slopes.)
  speed -= SLOPE_ACCEL_KMH_PER_SEC * pathSlope * dtSeconds;

  // Downhill helps you REACH top speed, never exceed it.
  return clamp(speed, -REVERSE_TOP_SPEED_KMH, stats.topSpeedKmh);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
