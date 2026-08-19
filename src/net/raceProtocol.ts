import type { CarRuntimeState } from "../domain/car";

/**
 * Messages exchanged over the WebRTC DataChannel once peers are connected (ADR 0004).
 * Race state itself never touches the signaling server.
 */
export type RaceMessage =
  | { type: "hello"; carId: string }
  | { type: "carState"; state: CarRuntimeState; raceTimeSeconds: number }
  | { type: "raceStart"; startAtEpochMs: number }
  | { type: "raceFinished"; winnerId: string; finishTimeSeconds: number };

export function encodeRaceMessage(message: RaceMessage): string {
  return JSON.stringify(message);
}

export function decodeRaceMessage(data: string): RaceMessage {
  return JSON.parse(data) as RaceMessage;
}
