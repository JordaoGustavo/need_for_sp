import type { CarDefinition } from "../domain/car";

/**
 * Car content registry (ADR 0005). Adding a car is adding an entry here — the menu
 * never hardcodes a car by name.
 */
export const CARS: readonly CarDefinition[] = [
  {
    id: "civic-turbo",
    stats: {
      topSpeedKmh: 230,
      accelerationKmhPerSec: 55,
      brakingKmhPerSec: 260,
      dragKmhPerSec: 18,
      turnRateRadPerSec: 2.4,
    },
    visual: { color: "#ff5a1f", displayName: "Civic Turbo" },
  },
  {
    id: "golf-gti",
    stats: {
      topSpeedKmh: 215,
      accelerationKmhPerSec: 62,
      brakingKmhPerSec: 280,
      dragKmhPerSec: 20,
      turnRateRadPerSec: 2.6,
    },
    visual: { color: "#1fa2ff", displayName: "Golf GTI" },
  },
  {
    id: "supra-drift",
    stats: {
      topSpeedKmh: 245,
      accelerationKmhPerSec: 48,
      brakingKmhPerSec: 240,
      dragKmhPerSec: 16,
      turnRateRadPerSec: 2.1,
    },
    visual: { color: "#f2d200", displayName: "Supra Drift" },
  },
];

export function getCarById(carId: string): CarDefinition | undefined {
  return CARS.find((car) => car.id === carId);
}
