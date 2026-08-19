import { describe, expect, it } from "vitest";
import { deriveHudState } from "../../src/game/hudDerivation";
import type { CarStats } from "../../src/domain/car";
import { DEFAULT_ENGINE_PROFILE } from "../../src/domain/car";

const stats: CarStats = {
  topSpeedKmh: 240,
  accelerationKmhPerSec: 60,
  brakingKmhPerSec: 260,
  dragKmhPerSec: 18,
  turnRateRadPerSec: 2.4,
};

describe("deriveHudState", () => {
  it("is in first gear at idle RPM when stopped", () => {
    const hud = deriveHudState(0, stats, DEFAULT_ENGINE_PROFILE);
    expect(hud.gear).toBe(1);
    expect(hud.rpm).toBe(DEFAULT_ENGINE_PROFILE.idleRpm);
  });

  it("reaches the top gear near max RPM at top speed", () => {
    const hud = deriveHudState(stats.topSpeedKmh, stats, DEFAULT_ENGINE_PROFILE);
    expect(hud.gear).toBe(6);
    expect(hud.rpm).toBeCloseTo(DEFAULT_ENGINE_PROFILE.maxRpm, 0);
  });

  it("never reports a gear outside [1, 6]", () => {
    for (const speed of [-10, 0, 50, 120, 239, 240, 500]) {
      const hud = deriveHudState(speed, stats, DEFAULT_ENGINE_PROFILE);
      expect(hud.gear).toBeGreaterThanOrEqual(1);
      expect(hud.gear).toBeLessThanOrEqual(6);
    }
  });

  it("never reports RPM outside [idleRpm, maxRpm]", () => {
    for (const speed of [-10, 0, 50, 120, 239, 240, 500]) {
      const hud = deriveHudState(speed, stats, DEFAULT_ENGINE_PROFILE);
      expect(hud.rpm).toBeGreaterThanOrEqual(DEFAULT_ENGINE_PROFILE.idleRpm);
      expect(hud.rpm).toBeLessThanOrEqual(DEFAULT_ENGINE_PROFILE.maxRpm);
    }
  });

  it("increases RPM within a gear as speed increases, then drops on upshift", () => {
    const justBelowUpshift = deriveHudState(39, stats, DEFAULT_ENGINE_PROFILE);
    const justAfterUpshift = deriveHudState(41, stats, DEFAULT_ENGINE_PROFILE);
    expect(justAfterUpshift.gear).toBeGreaterThan(justBelowUpshift.gear);
  });
});
