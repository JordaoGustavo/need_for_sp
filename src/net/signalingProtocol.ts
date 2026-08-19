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
  | { type: "signal"; room: string; payload: SignalPayload };

export type ServerToClientMessage =
  | { type: "joined"; role: PeerRole }
  | { type: "peer-joined" }
  | { type: "peer-left" }
  | { type: "signal"; payload: SignalPayload }
  | { type: "error"; message: string };
