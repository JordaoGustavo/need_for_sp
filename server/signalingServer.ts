import { WebSocketServer, type WebSocket } from "ws";
import type {
  ClientToServerMessage,
  PeerRole,
  ServerToClientMessage,
  SignalPayload,
} from "../src/net/signalingProtocol";

/**
 * Minimal signaling server (ADR 0003). Its only job is to let a 'host' and a 'guest'
 * exchange WebRTC SDP/ICE messages for a given Room Code. It holds no race state, no
 * persistence, and no auth beyond "you know the room code" (ADR 0008) — rooms live only
 * in this in-memory map for the lifetime of the process.
 */

const PORT = Number(process.env.SIGNALING_PORT ?? 8787);

/**
 * Room membership keyed by role via a Map (never a plain object indexed by an
 * unvalidated string) — this, plus isValidRole() below, is what stops a peer from
 * sending a crafted `role` (e.g. "__proto__") and polluting a shared prototype.
 */
class RoomState {
  private readonly members = new Map<PeerRole, WebSocket>();

  get(role: PeerRole): WebSocket | undefined {
    return this.members.get(role);
  }

  set(role: PeerRole, socket: WebSocket): void {
    this.members.set(role, socket);
  }

  clear(role: PeerRole): void {
    this.members.delete(role);
  }

  peerOf(role: PeerRole): WebSocket | undefined {
    return this.get(role === "host" ? "guest" : "host");
  }

  isEmpty(): boolean {
    return this.members.size === 0;
  }
}

const rooms = new Map<string, RoomState>();

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (socket) => {
  let joinedRoom: string | null = null;
  let joinedRole: PeerRole | null = null;

  socket.on("message", (raw) => {
    const message = parseClientMessage(raw.toString());
    if (!message) {
      send(socket, { type: "error", message: "Malformed message" });
      return;
    }

    if (message.type === "join") {
      const room = rooms.get(message.room) ?? new RoomState();
      rooms.set(message.room, room);

      if (room.get(message.role)) {
        send(socket, { type: "error", message: `Role '${message.role}' already taken in this room` });
        return;
      }

      room.set(message.role, socket);
      joinedRoom = message.room;
      joinedRole = message.role;

      send(socket, { type: "joined", role: message.role });

      const peer = room.peerOf(message.role);
      if (peer) {
        send(peer, { type: "peer-joined" });
        send(socket, { type: "peer-joined" });
      }
      return;
    }

    if (message.type === "signal") {
      const room = rooms.get(message.room);
      if (!room || !joinedRole) return;
      const peer = room.peerOf(joinedRole);
      if (peer) {
        send(peer, { type: "signal", payload: message.payload });
      }
    }
  });

  socket.on("close", () => {
    if (!joinedRoom || !joinedRole) return;
    const room = rooms.get(joinedRoom);
    if (!room) return;

    const peer = room.peerOf(joinedRole);
    room.clear(joinedRole);
    if (peer) {
      send(peer, { type: "peer-left" });
    }
    if (room.isEmpty()) {
      rooms.delete(joinedRoom);
    }
  });
});

function isValidRole(value: unknown): value is PeerRole {
  return value === "host" || value === "guest";
}

/**
 * Parses and validates a raw client message. Rejects anything whose shape doesn't
 * match ClientToServerMessage instead of trusting JSON.parse's `any` result — in
 * particular `role`/`room` are checked before ever being used as a lookup key.
 */
function parseClientMessage(raw: string): ClientToServerMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const candidate = parsed as Record<string, unknown>;

  if (candidate.type === "join") {
    if (typeof candidate.room !== "string" || !candidate.room) return null;
    if (!isValidRole(candidate.role)) return null;
    return { type: "join", room: candidate.room, role: candidate.role };
  }

  if (candidate.type === "signal") {
    if (typeof candidate.room !== "string" || !candidate.room) return null;
    if (typeof candidate.payload !== "object" || candidate.payload === null) return null;
    return { type: "signal", room: candidate.room, payload: candidate.payload as SignalPayload };
  }

  return null;
}

function send(socket: WebSocket, message: ServerToClientMessage): void {
  socket.send(JSON.stringify(message));
}

// eslint-disable-next-line no-console
console.log(`[signaling] listening on ws://localhost:${PORT}`);
