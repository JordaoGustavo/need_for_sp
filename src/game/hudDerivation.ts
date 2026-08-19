import type { CarStats, EngineProfile } from "../domain/car";
import type { HudState } from "../domain/hud";

/**
 * Upshift points as fractions of top speed. Real gearboxes stack short gears
 * at the bottom and long ones on top — 1st runs out at ~12% of top speed, 6th
 * covers the last quarter — instead of six equal bands.
 */
const GEAR_UPSHIFT_FRACTIONS = [0.12, 0.22, 0.35, 0.52, 0.73, 1.0] as const;

/** Where the needle lands right after an upshift, as a fraction of the rev range. */
const POST_SHIFT_RPM_FRACTION = 0.45;

/**
 * The MVP does not simulate a real gearbox — CarStats only has one continuous
 * acceleration curve. This derives a plausible-looking gear + RPM from speed alone,
 * purely for the HudSkin to render. Kept separate from CarRuntimeState/physics so a
 * future real gearbox simulation can replace this without changing the HudSkin contract.
 */
export function deriveHudState(
  speedKmh: number,
  stats: CarStats,
  engine: EngineProfile,
): HudState {
  const clampedSpeed = clamp(speedKmh, 0, stats.topSpeedKmh);
  const speedFraction = stats.topSpeedKmh === 0 ? 0 : clampedSpeed / stats.topSpeedKmh;

  let gear = GEAR_UPSHIFT_FRACTIONS.length;
  let bandStart = 0;
  let bandEnd = 1;
  for (let i = 0; i < GEAR_UPSHIFT_FRACTIONS.length; i++) {
    bandEnd = GEAR_UPSHIFT_FRACTIONS[i]!;
    if (speedFraction <= bandEnd) {
      gear = i + 1;
      break;
    }
    bandStart = bandEnd;
  }
  const positionInGear = clamp((speedFraction - bandStart) / (bandEnd - bandStart), 0, 1);

  // 1st gear pulls from idle; every upshift drops the needle to ~45% of the
  // rev range and climbs from there, like a real close-ratio box. The engine
  // revs up to the car's redline — never into the dial's dead zone beyond it.
  const rpmFraction =
    gear === 1
      ? positionInGear
      : POST_SHIFT_RPM_FRACTION + (1 - POST_SHIFT_RPM_FRACTION) * positionInGear;
  const rpm = engine.idleRpm + rpmFraction * (engine.redlineRpm - engine.idleRpm);

  return {
    speedKmh: clampedSpeed,
    rpm,
    maxRpm: engine.maxRpm,
    redlineRpm: engine.redlineRpm,
    gear,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
