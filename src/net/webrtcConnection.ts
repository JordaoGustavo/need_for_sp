import type { SignalingClient } from "./signalingClient";
import type { PeerRole } from "./signalingProtocol";

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
const DATA_CHANNEL_LABEL = "race";

/**
 * Thin contract over the actual race-state transport (ADR 0003/0004). Game code depends
 * on this, not on RTCPeerConnection directly, so the transport could be swapped later
 * (e.g. for a relay fallback when P2P fails) without touching RaceSession.
 */
export interface PeerConnection {
  send(data: string): void;
  onMessage(cb: (data: string) => void): void;
  onOpen(cb: () => void): void;
  onClose(cb: () => void): void;
  close(): void;
}

/**
 * Establishes one WebRTC DataChannel connection using `signaling` to exchange the
 * handshake, then resolves with a ready-to-use PeerConnection once the channel opens.
 */
export async function establishPeerConnection(
  signaling: SignalingClient,
  role: PeerRole,
): Promise<PeerConnection> {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  pc.addEventListener("icecandidate", (event) => {
    if (event.candidate) {
      signaling.sendSignal({ kind: "ice-candidate", candidate: event.candidate.toJSON() });
    }
  });

  signaling.onSignal(async (payload) => {
    if (payload.kind === "offer") {
      await pc.setRemoteDescription({ type: "offer", sdp: payload.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      signaling.sendSignal({ kind: "answer", sdp: answer.sdp ?? "" });
    } else if (payload.kind === "answer") {
      await pc.setRemoteDescription({ type: "answer", sdp: payload.sdp });
    } else if (payload.kind === "ice-candidate") {
      await pc.addIceCandidate(payload.candidate).catch(() => {
        // Ignore late/duplicate candidates — non-fatal for the MVP.
      });
    }
  });

  const channel = await (role === "host"
    ? createHostChannel(pc, signaling)
    : awaitGuestChannel(pc));

  return wrapDataChannel(channel, pc);
}

async function createHostChannel(
  pc: RTCPeerConnection,
  signaling: SignalingClient,
): Promise<RTCDataChannel> {
  const channel = pc.createDataChannel(DATA_CHANNEL_LABEL);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  signaling.sendSignal({ kind: "offer", sdp: offer.sdp ?? "" });
  return channel;
}

function awaitGuestChannel(pc: RTCPeerConnection): Promise<RTCDataChannel> {
  return new Promise((resolve) => {
    pc.addEventListener("datachannel", (event) => resolve(event.channel), { once: true });
  });
}

function wrapDataChannel(channel: RTCDataChannel, pc: RTCPeerConnection): Promise<PeerConnection> {
  return new Promise((resolve) => {
    const connection: PeerConnection = {
      send: (data) => channel.send(data),
      onMessage: (cb) => channel.addEventListener("message", (event) => cb(event.data)),
      onOpen: (cb) => channel.addEventListener("open", () => cb()),
      onClose: (cb) => channel.addEventListener("close", () => cb()),
      close: () => {
        channel.close();
        pc.close();
      },
    };

    if (channel.readyState === "open") {
      resolve(connection);
    } else {
      channel.addEventListener("open", () => resolve(connection), { once: true });
    }
  });
}
