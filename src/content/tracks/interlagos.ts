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
  widthMeters: 12,
  scenery: "city",
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
    { x: 178, z: 85 },
    { x: 205, z: 45 },
    { x: 182, z: 8 },
    // Laranjinha (tight right) and down to Pinheirinho (left)
    { x: 150, z: 40 },
    { x: 113, z: 75 },
    { x: 76, z: 95 },
    // Bico de Pato (right hairpin) and Mergulho
    { x: 95, z: 133 },
    { x: 60, z: 150 },
    { x: 44, z: 116 },
    // Junção (right) into the long climbing Subida dos Boxes
    { x: 20, z: 148 },
    { x: -12, z: 128 },
    { x: 12, z: 103 },
    { x: 80, z: 58 },
    // Arquibancadas: left onto the pit straight, closing the lap
    { x: 138, z: 18 },
  ],
};
