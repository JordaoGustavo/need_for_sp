import { describe, expect, it } from "vitest";
import { applyTrackBoundaryCollision, resolveCarCollision } from "../../src/physics/carPhysics";
import { CAR_LENGTH_METERS, CAR_WIDTH_METERS, createInitialCarRuntimeState } from "../../src/domain/car";

const TRACK_WIDTH = 10;
const MAX_LATERAL = TRACK_WIDTH / 2 - CAR_WIDTH_METERS / 2;

function carAt(distanceMeters: number, lateralOffsetMeters: number, speedKmh = 100) {
  return { ...createInitialCarRuntimeState("car"), distanceMeters, lateralOffsetMeters, speedKmh };
}

describe("applyTrackBoundaryCollision", () => {
  it("leaves a car inside the track untouched", () => {
    const state = carAt(50, 2);
    expect(applyTrackBoundaryCollision(state, TRACK_WIDTH, 0.016)).toBe(state);
  });

  it("clamps the car body to the track edge on both sides", () => {
    expect(applyTrackBoundaryCollision(carAt(50, 8), TRACK_WIDTH, 0.016).lateralOffsetMeters).toBe(MAX_LATERAL);
    expect(applyTrackBoundaryCollision(carAt(50, -8), TRACK_WIDTH, 0.016).lateralOffsetMeters).toBe(-MAX_LATERAL);
  });

  it("scrubs speed while grinding the wall, never below zero", () => {
    const hit = applyTrackBoundaryCollision(carAt(50, 8, 100), TRACK_WIDTH, 0.5);
    expect(hit.speedKmh).toBeLessThan(100);
    const slow = applyTrackBoundaryCollision(carAt(50, 8, 1), TRACK_WIDTH, 1);
    expect(slow.speedKmh).toBe(0);
  });
});

describe("resolveCarCollision", () => {
  it("does nothing when the cars are apart", () => {
    const local = carAt(0, -2.5);
    const remote = carAt(0, 2.5);
    expect(resolveCarCollision(local, remote)).toBe(local);
  });

  it("pushes a side-scraping car out laterally", () => {
    const local = carAt(100, 1.0);
    const remote = carAt(100, 0);
    const resolved = resolveCarCollision(local, remote);
    expect(resolved.lateralOffsetMeters - remote.lateralOffsetMeters).toBeCloseTo(CAR_WIDTH_METERS);
    expect(resolved.speedKmh).toBe(local.speedKmh);
  });

  it("stops a rear-ending car at the remote bumper and caps its speed", () => {
    const local = carAt(96.5, 0, 180);
    const remote = carAt(100, 0, 120);
    const resolved = resolveCarCollision(local, remote);
    expect(resolved.distanceMeters).toBeCloseTo(remote.distanceMeters - CAR_LENGTH_METERS);
    expect(resolved.speedKmh).toBe(120);
  });

  it("nudges the car ahead forward when hit from behind, keeping its speed", () => {
    const local = carAt(100, 0, 120);
    const remote = carAt(96.5, 0, 180);
    const resolved = resolveCarCollision(local, remote);
    expect(resolved.distanceMeters).toBeCloseTo(remote.distanceMeters + CAR_LENGTH_METERS);
    expect(resolved.speedKmh).toBe(120);
  });
});
