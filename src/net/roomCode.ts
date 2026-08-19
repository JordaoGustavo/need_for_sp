/**
 * Room Code generation and URL encoding for the "Convite via Link" flow (ADR 0008).
 * The code itself carries no authentication — anyone with the link joins the Sala.
 */

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
export const ROOM_CODE_LENGTH = 6;
export const ROOM_QUERY_PARAM = "room";

export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    const index = Math.floor(Math.random() * ROOM_CODE_ALPHABET.length);
    code += ROOM_CODE_ALPHABET[index];
  }
  return code;
}

export function buildInviteUrl(baseUrl: string, roomCode: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set(ROOM_QUERY_PARAM, roomCode);
  return url.toString();
}

export function parseRoomCodeFromUrl(url: string): string | null {
  return new URL(url).searchParams.get(ROOM_QUERY_PARAM);
}

/**
 * The host's chosen track rides along in the invite URL (same mechanism as
 * the room code, ADR 0008), so the guest races on the same map with no extra
 * protocol traffic.
 */
export const TRACK_QUERY_PARAM = "track";

export function withTrackParam(url: string, trackId: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set(TRACK_QUERY_PARAM, trackId);
  return parsed.toString();
}

export function parseTrackIdFromUrl(url: string): string | null {
  return new URL(url).searchParams.get(TRACK_QUERY_PARAM);
}

/** Host's day/night choice, also carried by the invite URL. */
export const TIME_OF_DAY_QUERY_PARAM = "tod";

export function withTimeOfDayParam(url: string, timeOfDay: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set(TIME_OF_DAY_QUERY_PARAM, timeOfDay);
  return parsed.toString();
}

export function parseTimeOfDayFromUrl(url: string): "day" | "night" {
  return new URL(url).searchParams.get(TIME_OF_DAY_QUERY_PARAM) === "day" ? "day" : "night";
}
