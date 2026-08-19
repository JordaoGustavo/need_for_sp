import { WebSocketSignalingClient } from "./signalingClient";
import { establishPeerConnection, type PeerConnection } from "./webrtcConnection";
import { buildInviteUrl, generateRoomCode } from "./roomCode";

export interface HostRoomHandle {
  readonly roomCode: string;
  readonly inviteUrl: string;
  readonly peerConnectionPromise: Promise<PeerConnection>;
}

/** Creates a Room as the Anfitrião (host) and starts waiting for the Convidado to join. */
export function hostRoom(signalingUrl: string, pageUrl: string): HostRoomHandle {
  const roomCode = generateRoomCode();
  const signaling = new WebSocketSignalingClient(signalingUrl);
  signaling.join(roomCode, "host");

  const peerConnectionPromise = new Promise<PeerConnection>((resolve, reject) => {
    signaling.onError((message) => reject(new Error(message)));
    signaling.onPeerJoined(() => {
      establishPeerConnection(signaling, "host").then(resolve, reject);
    });
  });

  return { roomCode, inviteUrl: buildInviteUrl(pageUrl, roomCode), peerConnectionPromise };
}

/** Joins an existing Room as the Convidado (guest), using the Código de Sala from the invite link. */
export function joinRoom(signalingUrl: string, roomCode: string): Promise<PeerConnection> {
  const signaling = new WebSocketSignalingClient(signalingUrl);
  signaling.join(roomCode, "guest");

  return new Promise<PeerConnection>((resolve, reject) => {
    signaling.onError((message) => reject(new Error(message)));
    signaling.onPeerJoined(() => {
      establishPeerConnection(signaling, "guest").then(resolve, reject);
    });
  });
}
