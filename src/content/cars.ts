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

  // --- Garagem JDM do ETNRLZ ("a garagem JDM mais valiosa do Brasil") -------
  {
    id: "novo-z",
    stats: {
      topSpeedKmh: 255,
      accelerationKmhPerSec: 28,
      brakingKmhPerSec: 54,
      dragKmhPerSec: 15,
      turnRateRadPerSec: 2.5,
    },
    // O "único Novo Z do Brasil": amarelo Ikazuchi.
    visual: { color: "#f2c200", displayName: "Novo Z", bodyStyle: "coupe" },
    sound: { baseFrequencyHz: 46, detuneCents: 12, brightness: 6 },
    // VR30DDTT twin turbo: redline 6800.
    engine: { idleRpm: 700, redlineRpm: 6800, maxRpm: 9000 },
  },
  {
    id: "skyline-r34",
    stats: {
      topSpeedKmh: 250,
      accelerationKmhPerSec: 27,
      brakingKmhPerSec: 52,
      dragKmhPerSec: 15,
      turnRateRadPerSec: 2.4,
    },
    // R34 GT-R em azul Bayside.
    visual: { color: "#2456c4", displayName: "Skyline R34", bodyStyle: "supra" },
    sound: { baseFrequencyHz: 52, detuneCents: 16, brightness: 7 },
    // RB26DETT: gira alto — redline 8000, dial 9000.
    engine: { idleRpm: 950, redlineRpm: 8000, maxRpm: 9000 },
  },

  // --- Garagem do Ricardinho ACF (ACF Performance) --------------------------
  {
    id: "chevette-acf",
    stats: {
      topSpeedKmh: 250,
      accelerationKmhPerSec: 31,
      brakingKmhPerSec: 48,
      dragKmhPerSec: 17,
      turnRateRadPerSec: 2.2,
    },
    // O Chevette de arrancada da ACF: leve e violento.
    visual: { color: "#c9ced4", displayName: "Chevette ACF", bodyStyle: "coupe" },
    sound: { baseFrequencyHz: 72, detuneCents: 20, brightness: 10 },
    // Quatro-cilindros preparado gira alto.
    engine: { idleRpm: 1000, redlineRpm: 7600, maxRpm: 9000 },
  },
  {
    id: "lancer-evo",
    stats: {
      topSpeedKmh: 245,
      accelerationKmhPerSec: 32,
      brakingKmhPerSec: 56,
      dragKmhPerSec: 17,
      turnRateRadPerSec: 2.8,
    },
    // O Lancer Evo raríssimo da garagem — largada AWD brutal.
    visual: { color: "#d5232e", displayName: "Lancer Evo", bodyStyle: "coupe" },
    sound: { baseFrequencyHz: 58, detuneCents: 14, brightness: 8 },
    engine: { idleRpm: 850, redlineRpm: 7000, maxRpm: 9000 },
  },

  // --- Garagem do Alemão da Caravan ------------------------------------------
  {
    id: "caravan-turbo",
    stats: {
      topSpeedKmh: 260,
      accelerationKmhPerSec: 27,
      brakingKmhPerSec: 42,
      dragKmhPerSec: 14,
      turnRateRadPerSec: 1.8,
    },
    // A Caravan turbo que mira os 300 km/h.
    visual: { color: "#d6c096", displayName: "Caravan Turbo", bodyStyle: "wagon" },
    sound: { baseFrequencyHz: 36, detuneCents: 26, brightness: 5 },
    // Seis-cilindros Chevrolet: grave, redline baixo.
    engine: { idleRpm: 700, redlineRpm: 6200, maxRpm: 8000 },
  },
  {
    id: "comodoro-weber",
    stats: {
      topSpeedKmh: 235,
      accelerationKmhPerSec: 24,
      brakingKmhPerSec: 44,
      dragKmhPerSec: 14,
      turnRateRadPerSec: 1.9,
    },
    // O Opala Comodoro turbo "de Weber".
    visual: { color: "#4a4f57", displayName: "Comodoro Turbo", bodyStyle: "supra" },
    sound: { baseFrequencyHz: 34, detuneCents: 24, brightness: 4 },
    engine: { idleRpm: 650, redlineRpm: 5800, maxRpm: 7000 },
  },

  // --- Garagem do Lucas (Auto Super) ------------------------------------------
  {
    id: "gol-glr-turbo",
    stats: {
      topSpeedKmh: 235,
      accelerationKmhPerSec: 29,
      brakingKmhPerSec: 50,
      dragKmhPerSec: 17,
      turnRateRadPerSec: 2.7,
    },
    // O Gol GLR Turbo, carro-chefe do canal.
    visual: { color: "#e8eaed", displayName: "Gol GLR Turbo", bodyStyle: "hatch", accentColor: "#c8102e" },
    sound: { baseFrequencyHz: 60, detuneCents: 18, brightness: 9 },
    engine: { idleRpm: 900, redlineRpm: 7200, maxRpm: 8000 },
  },
  {
    id: "chevette-supere",
    stats: {
      topSpeedKmh: 220,
      accelerationKmhPerSec: 26,
      brakingKmhPerSec: 46,
      dragKmhPerSec: 16,
      turnRateRadPerSec: 2.3,
    },
    // O Chevette 1974 "Supere", batizado após o acidente em Interlagos.
    visual: { color: "#f2b23d", displayName: "Chevette Supere", bodyStyle: "coupe" },
    sound: { baseFrequencyHz: 66, detuneCents: 22, brightness: 9 },
    engine: { idleRpm: 950, redlineRpm: 7000, maxRpm: 8000 },
  },
];

export function getCarById(carId: string): CarDefinition | undefined {
  return CARS.find((car) => car.id === carId);
}
