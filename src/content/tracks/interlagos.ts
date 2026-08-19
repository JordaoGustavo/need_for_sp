import type { TrackDefinition } from "../../domain/track";

/**
 * Interlagos — circuito fechado com o desenho do Autódromo de Interlagos
 * (traçado público), anti-horário como o real: Reta dos Boxes, S do Senna,
 * Curva do Sol, Reta Oposta, Descida do Lago, Ferradura, Laranjinha,
 * Pinheirinho, Bico de Pato, Mergulho, Junção e a Subida dos Boxes fechando
 * a volta. Duas voltas para vencer.
 *
 * Control points digitized from the public track map (standard orientation:
 * pit straight on top, infield below); the renderer rescales the loop so one
 * lap equals lengthMeters.
 */
export const INTERLAGOS: TrackDefinition = {
  id: "interlagos",
  displayName: "Interlagos",
  description: "O desenho de Interlagos: S do Senna à Junção — 2 voltas decidem.",
  raceType: "circuit",
  lengthMeters: 1800,
  laps: 2,
  checkpoints: [
    { id: "curva-do-sol", distanceMeters: 450 },
    { id: "descida-do-lago", distanceMeters: 900 },
    { id: "bico-de-pato", distanceMeters: 1350 },
  ],
  // Real Interlagos runs 12-15m wide; grandstands, pit boxes, kerbs and grass
  // verges come from the "autodromo" scenery.
  widthMeters: 13,
  // Kerbs + green-painted grass run-off usable on both sides before the wall.
  runoffMeters: 6,
  scenery: "autodromo",
  path: [
    // Reta dos Boxes (start/finish), heading "west" along the top
    { x: 40, z: -18 },
    { x: -60, z: -6 },
    // S do Senna: downhill left-right flick
    { x: -105, z: 25 },
    { x: -95, z: 70 },
    // Curva do Sol: long left onto the back straight
    { x: -130, z: 110 },
    { x: -112, z: 160 },
    // Reta Oposta
    { x: 0, z: 185 },
    { x: 120, z: 195 },
    // Descida do Lago: double left climbing into the infield
    { x: 160, z: 165 },
    { x: 146, z: 120 },
    // Up to Ferradura (right horseshoe at the top of the infield)
    { x: 180, z: 85 },
    { x: 210, z: 42 },
    { x: 184, z: 4 },
    // Laranjinha (right) and down to Pinheirinho (left) — opened up so the
    // road+run-off ribbons never fold over themselves (min radius ≥ ~25 raw)
    { x: 148, z: 38 },
    { x: 110, z: 74 },
    { x: 74, z: 96 },
    // Bico de Pato (wide right) and Mergulho
    { x: 88, z: 132 },
    { x: 58, z: 156 },
    { x: 34, z: 124 },
    // Junção (left-right) into the long climbing Subida dos Boxes
    { x: 6, z: 140 },
    { x: -20, z: 114 },
    { x: 4, z: 88 },
    // Subida dos Boxes: long climb east below the pit straight, then the wide
    // Café do Sol / Arquibancadas left sweep onto the straight (spread across
    // several points so the carousel stays wide — no hairpin pinch).
    { x: 60, z: 62 },
    { x: 120, z: 40 },
    { x: 148, z: 22 },
    { x: 160, z: -2 },
    { x: 146, z: -16 },
  ],
};
