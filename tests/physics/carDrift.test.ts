import { describe, expect, it } from "vitest";
import { MAX_DRIFT_ANGLE_RAD, stepCarPhysics } from "../../src/physics/carPhysics";
import { createInitialCarRuntimeState, type CarInput, type CarStats } from "../../src/domain/car";

const stats: CarStats = {
  topSpeedKmh: 220,
  accelerationKmhPerSec: 100,
  brakingKmhPerSec: 300,
  dragKmhPerSec: 20,
  turnRateRadPerSec: 2,
};

const DT = 1 / 60;

function drive(speedKmh: number, input: CarInput, seconds: number) {
  let state = { ...createInitialCarRuntimeState("car-1"), speedKmh };
  let maxDrift = 0;
  for (let t = 0; t < seconds; t += DT) {
    state = stepCarPhysics(state, stats, input, DT);
    maxDrift = Math.max(maxDrift, driftOf(state));
  }
  return { state, maxDrift };
}

function driftOf(state: { headingRad: number; velocityAngleRad: number }): number {
  return Math.abs(state.headingRad - state.velocityAngleRad);
}

describe("grip/drift model", () => {
  it("street-speed full lock keeps the slip subtle (normal driving feels normal)", () => {
    const { maxDrift } = drive(40, { throttle: true, brake: false, steer: 1 }, 1);
    expect(maxDrift).toBeLessThan(0.12);
  });

  it("sustained full lock at high speed builds a visible slip angle", () => {
    const { state } = drive(200, { throttle: true, brake: false, steer: 1 }, 1.5);
    expect(driftOf(state)).toBeGreaterThan(0.1);
  });

  it("handbrake + steer drifts far more than steer alone, capped at the max", () => {
    // Compare the PEAK drift: a long handbrake pull ends with the car stopped
    // and the slide already caught, so the final state hides the drift.
    const gripped = drive(100, { throttle: false, brake: false, steer: 1 }, 1.2);
    const drifting = drive(100, { throttle: false, brake: false, steer: 1, handbrake: true }, 1.2);
    expect(drifting.maxDrift).toBeGreaterThan(gripped.maxDrift * 2);
    expect(drifting.maxDrift).toBeLessThanOrEqual(MAX_DRIFT_ANGLE_RAD + 1e-9);
  });

  it("releasing everything lets grip catch the slide within ~a second", () => {
    // Short pull so the car is still rolling when we let go.
    let { state } = drive(120, { throttle: false, brake: false, steer: 1, handbrake: true }, 0.5);
    expect(driftOf(state)).toBeGreaterThan(0.2);
    for (let t = 0; t < 1; t += DT) {
      state = stepCarPhysics(state, stats, { throttle: false, brake: false, steer: 0 }, DT);
    }
    expect(driftOf(state)).toBeLessThan(0.05);
  });

  it("sliding scrubs speed: a drifting coast loses more than a straight coast", () => {
    const { state: straight } = drive(150, { throttle: false, brake: false, steer: 0 }, 1);
    let sideways = {
      ...createInitialCarRuntimeState("car-1"),
      speedKmh: 150,
      velocityAngleRad: -0.5, // seeded half-radian slide
    };
    for (let t = 0; t < 1; t += DT) {
      sideways = stepCarPhysics(sideways, stats, { throttle: false, brake: false, steer: 0 }, DT);
    }
    expect(sideways.speedKmh).toBeLessThan(straight.speedKmh);
  });

  it("reverse never drifts: velocity locks to the nose", () => {
    let state = { ...createInitialCarRuntimeState("car-1"), speedKmh: -20 };
    for (let t = 0; t < 1; t += DT) {
      state = stepCarPhysics(state, stats, { throttle: false, brake: true, steer: 1 }, DT);
    }
    expect(state.speedKmh).toBeLessThan(0);
    expect(state.velocityAngleRad).toBe(state.headingRad);
  });
});

describe("handbrake", () => {
  it("decelerates harder than coasting but softer than the pedal", () => {
    const { state: coasted } = drive(120, { throttle: false, brake: false, steer: 0 }, 0.5);
    const { state: handbraked } = drive(120, { throttle: false, brake: false, steer: 0, handbrake: true }, 0.5);
    const { state: braked } = drive(120, { throttle: false, brake: true, steer: 0 }, 0.5);
    expect(handbraked.speedKmh).toBeLessThan(coasted.speedKmh);
    expect(handbraked.speedKmh).toBeGreaterThan(braked.speedKmh);
  });

  it("overrides the throttle (locked rears pass no drive)", () => {
    const { state } = drive(80, { throttle: true, brake: false, steer: 0, handbrake: true }, 0.5);
    expect(state.speedKmh).toBeLessThan(80);
  });

  it("pulls reverse toward zero and holds — never engages reverse itself", () => {
    let state = { ...createInitialCarRuntimeState("car-1"), speedKmh: -25 };
    for (let t = 0; t < 3; t += DT) {
      state = stepCarPhysics(state, stats, { throttle: false, brake: false, steer: 0, handbrake: true }, DT);
    }
    expect(state.speedKmh).toBe(0);
  });

  it("is a real parking brake: a stopped car holds on a steep grade", () => {
    let held = createInitialCarRuntimeState("car-1");
    let rolling = createInitialCarRuntimeState("car-2");
    const none: CarInput = { throttle: false, brake: false, steer: 0 };
    for (let t = 0; t < 2; t += DT) {
      held = stepCarPhysics(held, stats, { ...none, handbrake: true }, DT, 0, 0.15);
      rolling = stepCarPhysics(rolling, stats, none, DT, 0, 0.15);
    }
    expect(held.speedKmh).toBe(0);
    expect(held.distanceMeters).toBe(0);
    expect(rolling.speedKmh).toBeLessThan(0); // documents the contrast: no handbrake = rolls back
  });
});
