/**
 * Message shapes exchanged with the signaling server (ADR 0003). This module is shared,
 * type-only where possible, between the browser client (src/net/signalingClient.ts) and
 * the Node signaling server (server/signalingServer.ts). The signaling server never sees
 * race state — only these envelopes, needed purely to broker a WebRTC handshake for a
 * given Room Code.
 */

export type PeerRole = "host" | "guest";

export type SignalPayload =
  | { kind: "offer"; sdp: string }
  | { kind: "answer"; sdp: string }
  | { kind: "ice-candidate"; candidate: RTCIceCandidateInit };

export type ClientToServerMessage =
  | { type: "join"; room: string; role: PeerRole }
  | { type: "signal"; room: string; payload: SignalPayload }
  // Lobby (friends) layer — same server, separate long-lived connection.
  // Nicknames are globally unique; the token (a client-generated secret kept
  // in localStorage) is what lets the same person log back into their nick.
  | { type: "lobby-login"; nick: string; token: string }
  | { type: "add-friend"; nick: string }
  | { type: "invite-friend"; nick: string; inviteUrl: string; roomCode: string };

export interface FriendInfo {
  readonly nick: string;
  readonly online: boolean;
}

export type ServerToClientMessage =
  | { type: "joined"; role: PeerRole }
  | { type: "peer-joined" }
  | { type: "peer-left" }
  | { type: "signal"; payload: SignalPayload }
  | { type: "error"; message: string }
  | { type: "lobby-ok"; nick: string; friends: readonly FriendInfo[] }
  | { type: "lobby-error"; message: string }
  | { type: "friends"; friends: readonly FriendInfo[] }
  | { type: "room-invite"; from: string; inviteUrl: string; roomCode: string };

/** 3–16 chars: letters, digits, underscore. Uniqueness is case-insensitive. */
export function isValidNick(nick: string): boolean {
  return /^[A-Za-z0-9_]{3,16}$/.test(nick);
}
