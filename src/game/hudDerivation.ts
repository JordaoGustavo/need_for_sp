import type { CarStats, EngineProfile } from "../domain/car";
import type { HudState } from "../domain/hud";

const GEAR_COUNT = 6;

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
  const rangePerGear = stats.topSpeedKmh / GEAR_COUNT;

  const gear = clamp(Math.floor(clampedSpeed / rangePerGear) + 1, 1, GEAR_COUNT);
  const gearStartSpeed = (gear - 1) * rangePerGear;
  const positionInGear = rangePerGear === 0 ? 0 : (clampedSpeed - gearStartSpeed) / rangePerGear;

  const rpm = engine.idleRpm + clamp(positionInGear, 0, 1) * (engine.maxRpm - engine.idleRpm);

  return {
    speedKmh: clampedSpeed,
    rpm,
    maxRpm: engine.maxRpm,
    gear,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
