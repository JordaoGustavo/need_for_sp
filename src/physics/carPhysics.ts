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

// --- Grip / drift model ------------------------------------------------------
// The velocity direction chases the nose (heading) at a grip rate. Huge at low
// speed (normal driving is indistinguishable from a fully-gripped model),
// shrinking with speed, collapsing under handbrake — that gap IS the drift.

/** Velocity-direction chase rate toward heading at standstill, 1/s. */
export const GRIP_RATE_MAX_PER_SEC = 22;
/** Speed (m/s) where grip has fallen to half via 1/(1+(v/v0)²) — ~108 km/h. */
const GRIP_FALLOFF_SPEED_MS = 30;
/** Handbrake: rear grip collapses to this fraction. */
const HANDBRAKE_GRIP_FACTOR = 0.2;
/** Handbrake + steer: extra yaw so the tail steps out on demand. */
const HANDBRAKE_YAW_BOOST = 1.6;
/** Drift angle cap (~34°) — past this the model "catches" the car; no spins. */
export const MAX_DRIFT_ANGLE_RAD = 0.6;
/** Speed scrubbed by sliding at the full drift cap, km/h/s (linear in drift). */
const DRIFT_SCRUB_KMH_PER_SEC = 30;
/** Handbrake decel as a fraction of the braking stat (weaker than the pedal). */
const HANDBRAKE_DECEL_FACTOR = 0.45;

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
 *
 * Grip: the direction of travel (velocityAngleRad) chases the nose (heading)
 * at a rate that shrinks with speed and collapses under handbrake — push past
 * the tires and the car slides while pointing into the corner (drift).
 */
export function stepCarPhysics(
  state: CarRuntimeState,
  stats: CarStats,
  input: CarInput,
  dtSeconds: number,
  pathCurvatureRadPerMeter = 0,
  pathSlope = 0,
): CarRuntimeState {
  const driftPrevRad = normalizeAngleRad(state.headingRad - state.velocityAngleRad);
  const nextSpeedKmh = computeNextSpeed(
    state.speedKmh,
    stats,
    input,
    dtSeconds,
    pathSlope,
    Math.abs(driftPrevRad),
  );

  const speedMs = nextSpeedKmh * KMH_TO_MS;
  const speedAbsMs = Math.abs(speedMs);
  // No yaw when parked, full agility by ~30 km/h, progressively calmer beyond.
  const steerAuthority = Math.min(1, speedAbsMs / 8) / (1 + speedAbsMs / 45);
  const reverseFactor = nextSpeedKmh < 0 ? -1 : 1;
  const yawBoost = input.handbrake && nextSpeedKmh > 0 ? HANDBRAKE_YAW_BOOST : 1;
  const steeredHeadingRad =
    state.headingRad +
    input.steer * stats.turnRateRadPerSec * steerAuthority * yawBoost * reverseFactor * dtSeconds;

  // Grip: exponential blend (frame-rate independent) of the velocity direction
  // toward the nose. Whatever gap survives the blend is the drift angle.
  const gripRatePerSec =
    (GRIP_RATE_MAX_PER_SEC / (1 + (speedAbsMs / GRIP_FALLOFF_SPEED_MS) ** 2)) *
    (input.handbrake ? HANDBRAKE_GRIP_FACTOR : 1);
  let driftRad =
    normalizeAngleRad(steeredHeadingRad - state.velocityAngleRad) *
    Math.exp(-gripRatePerSec * dtSeconds);
  driftRad = clamp(driftRad, -MAX_DRIFT_ANGLE_RAD, MAX_DRIFT_ANGLE_RAD);
  // Reverse/parked: no drift model — velocity locks to heading (sane reversing).
  let velocityAngleRad = nextSpeedKmh < 0 ? steeredHeadingRad : steeredHeadingRad - driftRad;

  // The car travels where its VELOCITY points, not where the nose does.
  const avgSpeedMs = ((state.speedKmh + nextSpeedKmh) / 2) * KMH_TO_MS;
  const forwardDeltaMeters = Math.cos(velocityAngleRad) * avgSpeedMs * dtSeconds;
  // The road turned under the car; un-turn BOTH path-frame angles by the same amount.
  const headingRad = steeredHeadingRad - pathCurvatureRadPerMeter * forwardDeltaMeters;
  velocityAngleRad -= pathCurvatureRadPerMeter * forwardDeltaMeters;

  const distanceMeters = state.distanceMeters + forwardDeltaMeters;
  const lateralOffsetMeters = state.lateralOffsetMeters + Math.sin(velocityAngleRad) * avgSpeedMs * dtSeconds;

  return {
    carId: state.carId,
    distanceMeters,
    lateralOffsetMeters,
    speedKmh: nextSpeedKmh,
    headingRad,
    velocityAngleRad,
  };
}

function normalizeAngleRad(angle: number): number {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
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
  driftAbsRad: number,
): number {
  let speed = currentSpeedKmh;

  if (input.handbrake) {
    // Locked rears: no drive gets through, firm pull toward 0 (weaker than the
    // pedal, works from reverse too, holds at 0 — no reverse engagement).
    const handbrakeDecel = stats.brakingKmhPerSec * HANDBRAKE_DECEL_FACTOR;
    speed =
      speed > 0
        ? Math.max(0, speed - handbrakeDecel * dtSeconds)
        : Math.min(0, speed + handbrakeDecel * dtSeconds);
  } else if (input.throttle) {
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

  // Sliding scrubs speed: tires shed energy sideways, linear in drift angle.
  if (speed > 0) {
    speed = Math.max(0, speed - DRIFT_SCRUB_KMH_PER_SEC * (driftAbsRad / MAX_DRIFT_ANGLE_RAD) * dtSeconds);
  }

  // Gravity along the road: acts on the signed speed, so it also pushes a
  // stationary car backward down a steep grade. (The coast branch's snap-to-
  // zero doubles as a weak parking brake on gentle slopes; the handbrake is a
  // real parking brake — a handbraked, stopped car holds on any grade.)
  if (!(input.handbrake && speed === 0)) {
    speed -= SLOPE_ACCEL_KMH_PER_SEC * pathSlope * dtSeconds;
  }

  // Downhill helps you REACH top speed, never exceed it.
  return clamp(speed, -REVERSE_TOP_SPEED_KMH, stats.topSpeedKmh);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
