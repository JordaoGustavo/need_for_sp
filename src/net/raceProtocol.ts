import type { CarRuntimeState } from "../domain/car";

/**
 * Messages exchanged over the WebRTC DataChannel once peers are connected (ADR 0004).
 * Race state itself never touches the signaling server.
 */
export type RaceMessage =
  | { type: "hello"; carId: string }
  | { type: "carState"; state: CarRuntimeState; raceTimeSeconds: number }
  | { type: "raceStart"; startAtEpochMs: number }
  | { type: "raceFinished"; winnerId: string; finishTimeSeconds: number }
  | { type: "engineBlown"; playerId: string }
  // Clock sync (guest → host → guest): startAtEpochMs is host-clock time, so
  // the guest measures the host/guest clock offset NTP-style to convert it.
  // Without this, any wall-clock skew between the two machines becomes a
  // start-line head start of the same size.
  | { type: "clockPing"; sentAtMs: number }
  | { type: "clockPong"; pingSentAtMs: number; hostNowMs: number };

export function encodeRaceMessage(message: RaceMessage): string {
  return JSON.stringify(message);
}

export function decodeRaceMessage(data: string): RaceMessage {
  return JSON.parse(data) as RaceMessage;
}
