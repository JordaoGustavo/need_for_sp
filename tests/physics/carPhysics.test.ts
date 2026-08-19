import { describe, expect, it } from "vitest";
import { stepCarPhysics } from "../../src/physics/carPhysics";
import { createInitialCarRuntimeState, type CarStats } from "../../src/domain/car";

const stats: CarStats = {
  topSpeedKmh: 200,
  accelerationKmhPerSec: 100,
  brakingKmhPerSec: 300,
  dragKmhPerSec: 20,
  turnRateRadPerSec: 2,
};

describe("stepCarPhysics", () => {
  it("accelerates towards top speed when throttle is held", () => {
    const state = createInitialCarRuntimeState("car-1");
    const next = stepCarPhysics(state, stats, { throttle: true, brake: false, steer: 0 }, 1);
    expect(next.speedKmh).toBe(100);
  });

  it("never exceeds top speed", () => {
    let state = createInitialCarRuntimeState("car-1");
    for (let i = 0; i < 10; i++) {
      state = stepCarPhysics(state, stats, { throttle: true, brake: false, steer: 0 }, 1);
    }
    expect(state.speedKmh).toBeLessThanOrEqual(stats.topSpeedKmh);
    expect(state.speedKmh).toBe(200);
  });

  it("decelerates under drag when no input is given", () => {
    const moving = { ...createInitialCarRuntimeState("car-1"), speedKmh: 50 };
    const next = stepCarPhysics(moving, stats, { throttle: false, brake: false, steer: 0 }, 1);
    expect(next.speedKmh).toBe(30);
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
});
