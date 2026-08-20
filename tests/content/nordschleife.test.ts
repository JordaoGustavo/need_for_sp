import { describe, expect, it } from "vitest";
import { NORDSCHLEIFE } from "../../src/content/tracks/nordschleife";
import { createTrackPathModel } from "../../src/rendering/three/trackPath";

// Same normalization the game's curvature feed uses (raceScreen.ts).
function normalizeAngleRad(angle: number): number {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Regression guard over the generated Nordschleife data: if the extractor is
 * re-run and produces geometry the game can't render or race on, these fail.
 */
describe("nordschleife track data", () => {
  it("declares strictly increasing checkpoints inside the lap", () => {
    let previous = 0;
    for (const checkpoint of NORDSCHLEIFE.checkpoints) {
      expect(checkpoint.distanceMeters).toBeGreaterThan(previous);
      expect(checkpoint.distanceMeters).toBeLessThan(NORDSCHLEIFE.lengthMeters);
      previous = checkpoint.distanceMeters;
    }
    expect(NORDSCHLEIFE.checkpoints.length).toBeGreaterThanOrEqual(3);
  });

  it("never bends tighter than the road ribbon tolerates (no folded hairpins)", () => {
    const model = createTrackPathModel(NORDSCHLEIFE);
    // Same finite-difference curvature the game feeds the physics.
    for (let d = 0; d < NORDSCHLEIFE.lengthMeters; d += 4) {
      const ahead = model.pose(d + 2, 0).forwardAngleRad;
      const behind = model.pose(d - 2, 0).forwardAngleRad;
      const curvature = Math.abs(normalizeAngleRad(ahead - behind) / 4);
      expect(curvature, `curvature at ${d}m`).toBeLessThanOrEqual(1 / 24);
    }
  });

  it("keeps every grade drivable (|slope| <= 20%)", () => {
    const elevation = NORDSCHLEIFE.elevation!;
    for (let i = 1; i < elevation.length; i++) {
      const a = elevation[i - 1]!;
      const b = elevation[i]!;
      const slope = Math.abs(b.yMeters - a.yMeters) / Math.max(1, b.atMeters - a.atMeters);
      expect(slope, `slope at ${a.atMeters}m`).toBeLessThanOrEqual(0.2);
    }
  });

  it("closes the elevation loop: lap 2 continues seamlessly (wrap fix)", () => {
    const elevation = NORDSCHLEIFE.elevation!;
    expect(elevation[0]!.yMeters).toBeCloseTo(elevation[elevation.length - 1]!.yMeters, 1);

    const model = createTrackPathModel(NORDSCHLEIFE);
    const length = NORDSCHLEIFE.lengthMeters;
    expect(model.pose(length, 0).y).toBeCloseTo(model.pose(0, 0).y, 1);
    // Just past the line the elevation must move like the lap start, not
    // freeze at the last key point.
    expect(model.pose(length + 50, 0).y).toBeCloseTo(model.pose(50, 0).y, 1);
  });
});
