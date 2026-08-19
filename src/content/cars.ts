import type { CarDefinition } from "../domain/car";

/**
 * Car content registry (ADR 0005). Adding a car is adding an entry here — the menu
 * never hardcodes a car by name.
 */
export const CARS: readonly CarDefinition[] = [
  // accelerationKmhPerSec is the PEAK (standstill) acceleration — physics tapers
  // it towards zero at top speed. 26 peak ≈ 0-100 in ~4s, tuner-car quick.
  // brakingKmhPerSec ≈ 50 stops 100→0 in ~2s — hard but with real weight to it.
  {
    id: "civic-turbo",
    stats: {
      topSpeedKmh: 230,
      accelerationKmhPerSec: 26,
      brakingKmhPerSec: 50,
      dragKmhPerSec: 16,
      turnRateRadPerSec: 2.4,
    },
    visual: { color: "#ff5a1f", displayName: "Civic Turbo", bodyStyle: "coupe" },
    sound: { baseFrequencyHz: 62, detuneCents: 14, brightness: 9 },
    // Civic 1.5T (L15B): red zone at 6500, dial to 8000, Honda idle ~750.
    engine: { idleRpm: 750, redlineRpm: 6500, maxRpm: 8000 },
  },
  {
    id: "golf-gti",
    stats: {
      topSpeedKmh: 215,
      accelerationKmhPerSec: 28,
      brakingKmhPerSec: 52,
      dragKmhPerSec: 18,
      turnRateRadPerSec: 2.6,
    },
    visual: { color: "#1fa2ff", displayName: "Golf GTI", bodyStyle: "hatch", accentColor: "#e11d2e" },
    sound: { baseFrequencyHz: 50, detuneCents: 8, brightness: 7 },
    // GTI 2.0 TSI (EA888): red zone ~6500 (limiter 6800), dial to 8000.
    engine: { idleRpm: 800, redlineRpm: 6500, maxRpm: 8000 },
  },
  {
    id: "supra-drift",
    stats: {
      topSpeedKmh: 245,
      accelerationKmhPerSec: 23,
      brakingKmhPerSec: 46,
      dragKmhPerSec: 14,
      turnRateRadPerSec: 2.1,
    },
    visual: { color: "#f2d200", displayName: "Supra Drift", bodyStyle: "supra" },
    sound: { baseFrequencyHz: 40, detuneCents: 22, brightness: 5 },
    // Supra Mk4 (2JZ-GTE): tach redline at 6800 (fuel cut ~7000+), dial to 9000.
    engine: { idleRpm: 650, redlineRpm: 6800, maxRpm: 9000 },
  },
];

export function getCarById(carId: string): CarDefinition | undefined {
  return CARS.find((car) => car.id === carId);
}
