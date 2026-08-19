import type { TrackDefinition } from "../../domain/track";

/**
 * Interlagita — circuito fechado inspirado no desenho de Interlagos, correndo
 * no sentido anti-horário como o original: largada na reta principal, o "S"
 * na sequência, o arco da Curva do Sol abrindo para a reta oposta, o miolo
 * travado e a subida longa de volta à reta. Duas voltas para vencer.
 *
 * The control points below are the closed centerline (roughly in meters);
 * the renderer rescales the loop so its length matches lengthMeters exactly.
 */
export const INTERLAGITA: TrackDefinition = {
  id: "interlagita",
  displayName: "Interlagita",
  description: "Circuito fechado inspirado em Interlagos — 2 voltas decidem.",
  raceType: "circuit",
  lengthMeters: 1800,
  laps: 2,
  checkpoints: [
    { id: "s-do-senna", distanceMeters: 450 },
    { id: "reta-oposta", distanceMeters: 900 },
    { id: "miolo", distanceMeters: 1350 },
  ],
  widthMeters: 12,
  path: [
    // Main straight (start line near the first point, heading -z)
    { x: 0, z: 0 },
    { x: 0, z: -170 },
    // "S" complex: dive left, flick right
    { x: -45, z: -235 },
    { x: -20, z: -300 },
    { x: -80, z: -350 },
    // Curva do Sol: long left arc onto the back straight
    { x: -170, z: -365 },
    { x: -235, z: -300 },
    // Reta Oposta (back straight)
    { x: -250, z: -160 },
    { x: -245, z: -20 },
    // Tight infield: hairpin right, short left, loop back
    { x: -215, z: 60 },
    { x: -150, z: 45 },
    { x: -155, z: -40 },
    { x: -110, z: -95 },
    // Long climbing arc back to the main straight
    { x: -70, z: 30 },
    { x: -45, z: 95 },
    { x: -8, z: 70 },
  ],
};
