import { describe, expect, it } from "vitest";
import { applyTrackLimits, stepCarPhysics, TRACK_END_RUNOFF_METERS } from "../../src/physics/carPhysics";
import { createInitialCarRuntimeState, type CarStats } from "../../src/domain/car";

const stats: CarStats = {
  topSpeedKmh: 200,
  accelerationKmhPerSec: 100,
  brakingKmhPerSec: 300,
  dragKmhPerSec: 20,
  turnRateRadPerSec: 2,
};

describe("stepCarPhysics", () => {
  it("accelerates from standstill at the full (peak) acceleration", () => {
    const state = createInitialCarRuntimeState("car-1");
    const next = stepCarPhysics(state, stats, { throttle: true, brake: false, steer: 0 }, 0.1);
    // At speed 0 the power taper is 1, so the peak stat applies unreduced.
    expect(next.speedKmh).toBeCloseTo(10);
  });

  it("acceleration tapers off as speed approaches top speed", () => {
    const slow = { ...createInitialCarRuntimeState("car-1"), speedKmh: 20 };
    const fast = { ...createInitialCarRuntimeState("car-1"), speedKmh: 180 };
    const input = { throttle: true, brake: false, steer: 0 };
    const slowGain = stepCarPhysics(slow, stats, input, 0.1).speedKmh - 20;
    const fastGain = stepCarPhysics(fast, stats, input, 0.1).speedKmh - 180;
    expect(fastGain).toBeGreaterThan(0);
    expect(fastGain).toBeLessThan(slowGain / 2);
  });

  it("never exceeds top speed", () => {
    let state = createInitialCarRuntimeState("car-1");
    for (let i = 0; i < 600; i++) {
      state = stepCarPhysics(state, stats, { throttle: true, brake: false, steer: 0 }, 0.1);
    }
    expect(state.speedKmh).toBeLessThanOrEqual(stats.topSpeedKmh);
    expect(state.speedKmh).toBeGreaterThan(stats.topSpeedKmh * 0.95);
  });

  it("decelerates under drag when no input is given, more so at high speed", () => {
    const slow = { ...createInitialCarRuntimeState("car-1"), speedKmh: 50 };
    const fast = { ...createInitialCarRuntimeState("car-1"), speedKmh: 180 };
    const coast = { throttle: false, brake: false, steer: 0 };
    const slowLoss = 50 - stepCarPhysics(slow, stats, coast, 1).speedKmh;
    const fastLoss = 180 - stepCarPhysics(fast, stats, coast, 1).speedKmh;
    expect(slowLoss).toBeGreaterThan(0);
    expect(fastLoss).toBeGreaterThan(slowLoss);
  });

  it("decelerates faster under braking than under drag alone", () => {
    const moving = { ...createInitialCarRuntimeState("car-1"), speedKmh: 50 };
    const braked = stepCarPhysics(moving, stats, { throttle: false, brake: true, steer: 0 }, 0.1);
    const dragged = stepCarPhysics(moving, stats, { throttle: false, brake: false, steer: 0 }, 0.1);
    expect(braked.speedKmh).toBeLessThan(dragged.speedKmh);
  });

  it("never goes below zero speed", () => {
    const moving = { ...createInitialCarRuntimeState("car-1"), speedKmh: 5 };
    const next = stepCarPhysics(moving, stats, { throttle: false, brake: true, steer: 0 }, 1);
    expect(next.speedKmh).toBe(0);
  });

  it("advances distance based on speed and elapsed time", () => {
    const moving = { ...createInitialCarRuntimeState("car-1"), speedKmh: 360 }; // 100 m/s
    const next = stepCarPhysics(moving, stats, { throttle: true, brake: false, steer: 0 }, 1);
    // 360 km/h = 100 m/s, capped speed stays >= 200 (top speed), distance uses pre-cap avg speed window
    expect(next.distanceMeters).toBeGreaterThan(0);
  });

  it("applies steering as lateral offset change proportional to speed and dt", () => {
    const moving = { ...createInitialCarRuntimeState("car-1"), speedKmh: 100 };
    const next = stepCarPhysics(moving, stats, { throttle: false, brake: false, steer: 1 }, 1);
    expect(next.lateralOffsetMeters).toBeGreaterThan(0);
  });

  it("keeps its heading when the wheel is released (no auto-centering rails)", () => {
    let state = { ...createInitialCarRuntimeState("car-1"), speedKmh: 80 };
    for (let i = 0; i < 30; i++) {
      state = stepCarPhysics(state, stats, { throttle: true, brake: false, steer: 1 }, 1 / 60);
    }
    const headingAfterSteer = state.headingRad;
    state = stepCarPhysics(state, stats, { throttle: true, brake: false, steer: 0 }, 1 / 60);
    expect(state.headingRad).toBeCloseTo(headingAfterSteer);
  });

  it("does not corner for free: path curvature pushes an unsteered car off line", () => {
    const moving = { ...createInitialCarRuntimeState("car-1"), speedKmh: 100 };
    const straightOn = stepCarPhysics(moving, stats, { throttle: true, brake: false, steer: 0 }, 0.1);
    const inCorner = stepCarPhysics(moving, stats, { throttle: true, brake: false, steer: 0 }, 0.1, 0.02);
    // The road bent (rightwards curvature) under the car; relative to the
    // road the car now points outward — the driver must steer to follow.
    expect(straightOn.headingRad).toBe(0);
    expect(inCorner.headingRad).toBeLessThan(0);
  });

  it("cannot yaw while parked", () => {
    const parked = createInitialCarRuntimeState("car-1");
    const next = stepCarPhysics(parked, stats, { throttle: false, brake: false, steer: 1 }, 1);
    expect(next.headingRad).toBe(0);
  });

  it("uphill bleeds speed and downhill feeds it, relative to flat", () => {
    const moving = { ...createInitialCarRuntimeState("car-1"), speedKmh: 100 };
    const input = { throttle: true, brake: false, steer: 0 };
    const flat = stepCarPhysics(moving, stats, input, 0.1).speedKmh;
    const uphill = stepCarPhysics(moving, stats, input, 0.1, 0, 0.1).speedKmh;
    const downhill = stepCarPhysics(moving, stats, input, 0.1, 0, -0.1).speedKmh;
    expect(uphill).toBeLessThan(flat);
    expect(downhill).toBeGreaterThan(flat);
  });

  it("coasting downhill decays slower than coasting on the flat", () => {
    const moving = { ...createInitialCarRuntimeState("car-1"), speedKmh: 120 };
    const coast = { throttle: false, brake: false, steer: 0 };
    const flat = stepCarPhysics(moving, stats, coast, 1).speedKmh;
    const downhill = stepCarPhysics(moving, stats, coast, 1, 0, -0.15).speedKmh;
    expect(downhill).toBeGreaterThan(flat);
  });

  it("omitting the slope argument is byte-identical to the previous behavior", () => {
    const moving = { ...createInitialCarRuntimeState("car-1"), speedKmh: 77, headingRad: 0.1 };
    const input = { throttle: true, brake: false, steer: 0.3 };
    const implicit = stepCarPhysics(moving, stats, input, 1 / 60, 0.01);
    const explicitZero = stepCarPhysics(moving, stats, input, 1 / 60, 0.01, 0);
    expect(implicit).toEqual(explicitZero);
  });

  it("a stationary car on a steep grade rolls backward (documented behavior)", () => {
    let state = createInitialCarRuntimeState("car-1");
    for (let i = 0; i < 180; i++) {
      state = stepCarPhysics(state, stats, { throttle: false, brake: false, steer: 0 }, 1 / 60, 0, 0.15);
    }
    expect(state.speedKmh).toBeLessThan(0);
    expect(state.distanceMeters).toBeLessThan(0);
  });

  it("engages reverse when braking from a standstill, capped at walking pace", () => {
    let state = createInitialCarRuntimeState("car-1");
    for (let i = 0; i < 300; i++) {
      state = stepCarPhysics(state, stats, { throttle: false, brake: true, steer: 0 }, 1 / 60);
    }
    expect(state.speedKmh).toBeLessThan(0);
    expect(state.speedKmh).toBeGreaterThanOrEqual(-30);
    expect(state.distanceMeters).toBeLessThan(0);
  });
});

describe("applyTrackLimits", () => {
  it("crashing into the end wall bounces the car back, capped", () => {
    const past = { ...createInitialCarRuntimeState("car-1"), distanceMeters: 900, speedKmh: 120 };
    const crashed = applyTrackLimits(past, 800);
    expect(crashed.distanceMeters).toBe(800 + TRACK_END_RUNOFF_METERS);
    expect(crashed.speedKmh).toBeLessThan(0);
    expect(crashed.speedKmh).toBeGreaterThanOrEqual(-25);
  });

  it("reversing into the start backstop bounces the car forward", () => {
    const behind = { ...createInitialCarRuntimeState("car-1"), distanceMeters: -20, speedKmh: -25 };
    const crashed = applyTrackLimits(behind, 800);
    expect(crashed.distanceMeters).toBe(-8);
    expect(crashed.speedKmh).toBeGreaterThan(0);
  });

  it("leaves a car on the strip untouched", () => {
    const onTrack = { ...createInitialCarRuntimeState("car-1"), distanceMeters: 400, speedKmh: 180 };
    expect(applyTrackLimits(onTrack, 800)).toBe(onTrack);
  });
});
