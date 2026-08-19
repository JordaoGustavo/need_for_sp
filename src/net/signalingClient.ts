import type { PeerRole, ServerToClientMessage, SignalPayload } from "./signalingProtocol";

/**
 * Browser-side counterpart to server/signalingServer.ts (ADR 0003). Talks WebSocket to
 * the signaling server only to join a Room and relay WebRTC handshake payloads — it
 * never carries race state.
 */
export interface SignalingClient {
  join(room: string, role: PeerRole): void;
  sendSignal(payload: SignalPayload): void;
  onJoined(cb: (role: PeerRole) => void): void;
  onPeerJoined(cb: () => void): void;
  onPeerLeft(cb: () => void): void;
  onSignal(cb: (payload: SignalPayload) => void): void;
  onError(cb: (message: string) => void): void;
  close(): void;
}

export class WebSocketSignalingClient implements SignalingClient {
  private readonly socket: WebSocket;
  private room: string | null = null;
  private readonly readyQueue: Array<() => void> = [];
  private ready = false;

  private joinedCb: ((role: PeerRole) => void) | null = null;
  private peerJoinedCb: (() => void) | null = null;
  private peerLeftCb: (() => void) | null = null;
  private signalCb: ((payload: SignalPayload) => void) | null = null;
  private errorCb: ((message: string) => void) | null = null;

  constructor(signalingUrl: string) {
    this.socket = new WebSocket(signalingUrl);
    this.socket.addEventListener("open", () => {
      this.ready = true;
      this.readyQueue.forEach((run) => run());
      this.readyQueue.length = 0;
    });
    this.socket.addEventListener("message", (event) => {
      const message: ServerToClientMessage = JSON.parse(event.data);
      this.handleMessage(message);
    });
  }

  join(room: string, role: PeerRole): void {
    this.room = room;
    this.whenReady(() => this.socket.send(JSON.stringify({ type: "join", room, role })));
  }

  sendSignal(payload: SignalPayload): void {
    if (!this.room) throw new Error("Cannot send signal before joining a room");
    const room = this.room;
    this.whenReady(() => this.socket.send(JSON.stringify({ type: "signal", room, payload })));
  }

  onJoined(cb: (role: PeerRole) => void): void {
    this.joinedCb = cb;
  }

  onPeerJoined(cb: () => void): void {
    this.peerJoinedCb = cb;
  }

  onPeerLeft(cb: () => void): void {
    this.peerLeftCb = cb;
  }

  onSignal(cb: (payload: SignalPayload) => void): void {
    this.signalCb = cb;
  }

  onError(cb: (message: string) => void): void {
    this.errorCb = cb;
  }

  close(): void {
    this.socket.close();
  }

  private whenReady(run: () => void): void {
    if (this.ready) {
      run();
    } else {
      this.readyQueue.push(run);
    }
  }

  private handleMessage(message: ServerToClientMessage): void {
    switch (message.type) {
      case "joined":
        this.joinedCb?.(message.role);
        return;
      case "peer-joined":
        this.peerJoinedCb?.();
        return;
      case "peer-left":
        this.peerLeftCb?.();
        return;
      case "signal":
        this.signalCb?.(message.payload);
        return;
      case "error":
        this.errorCb?.(message.message);
        return;
    }
  }
}
