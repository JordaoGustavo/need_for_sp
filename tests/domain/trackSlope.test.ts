import { describe, expect, it } from "vitest";
import { createTrackSlope, type TrackDefinition } from "../../src/domain/track";

function makeTrack(overrides: Partial<TrackDefinition>): TrackDefinition {
  return {
    id: "t",
    displayName: "T",
    description: "",
    raceType: "circuit",
    lengthMeters: 1000,
    laps: 1,
    checkpoints: [],
    widthMeters: 12,
    scenery: "autodromo",
    ...overrides,
  };
}

describe("createTrackSlope", () => {
  it("returns 0 everywhere when the track has no elevation", () => {
    const slope = createTrackSlope(makeTrack({}));
    expect(slope(0)).toBe(0);
    expect(slope(500)).toBe(0);
  });

  it("returns the piecewise-linear segment slope", () => {
    const slope = createTrackSlope(
      makeTrack({
        elevation: [
          { atMeters: 0, yMeters: 0 },
          { atMeters: 100, yMeters: 10 }, // +10%
          { atMeters: 300, yMeters: 0 }, // -5%
        ],
      }),
    );
    expect(slope(50)).toBeCloseTo(0.1);
    expect(slope(200)).toBeCloseTo(-0.05);
  });

  it("is flat before the first and after the last key point on open tracks", () => {
    const slope = createTrackSlope(
      makeTrack({
        raceType: "drag",
        elevation: [
          { atMeters: 100, yMeters: 0 },
          { atMeters: 200, yMeters: 10 },
        ],
      }),
    );
    expect(slope(50)).toBe(0);
    expect(slope(150)).toBeCloseTo(0.1);
    expect(slope(900)).toBe(0);
  });

  it("wraps by track length on circuits, so lap 2 climbs like lap 1", () => {
    const slope = createTrackSlope(
      makeTrack({
        elevation: [
          { atMeters: 0, yMeters: 0 },
          { atMeters: 500, yMeters: 25 },
          { atMeters: 1000, yMeters: 0 },
        ],
      }),
    );
    expect(slope(250)).toBeCloseTo(0.05);
    expect(slope(1250)).toBeCloseTo(0.05); // lap 2
    expect(slope(-250)).toBeCloseTo(-0.05); // just before the line = descending
  });
});
