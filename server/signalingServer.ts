import { WebSocketServer, type WebSocket } from "ws";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  isValidNick,
  type ClientToServerMessage,
  type FriendInfo,
  type PeerRole,
  type ServerToClientMessage,
  type SignalPayload,
} from "../src/net/signalingProtocol";
import { LobbyStore, canonicalNick } from "./lobbyStore";

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

// --- Lobby (friends) layer --------------------------------------------------

const lobbyStore = new LobbyStore(join(dirname(fileURLToPath(import.meta.url)), "lobbyStore.json"));
/** Online lobby connections keyed by canonical nick (one socket per nick). */
const onlineByNick = new Map<string, WebSocket>();

function friendListFor(nick: string): FriendInfo[] {
  return lobbyStore.friendsOf(nick).map((friendNick) => ({
    nick: friendNick,
    online: onlineByNick.has(canonicalNick(friendNick)),
  }));
}

/** Push updated friend lists to everyone who has `nick` as a friend and is online. */
function broadcastPresenceChange(nick: string): void {
  for (const friendNick of lobbyStore.friendsOf(nick)) {
    const socket = onlineByNick.get(canonicalNick(friendNick));
    if (socket) send(socket, { type: "friends", friends: friendListFor(friendNick) });
  }
}

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (socket) => {
  let joinedRoom: string | null = null;
  let joinedRole: PeerRole | null = null;
  let lobbyNick: string | null = null;

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
      return;
    }

    if (message.type === "lobby-login") {
      const result = lobbyStore.login(message.nick, message.token);
      if (!result.ok) {
        send(socket, { type: "lobby-error", message: result.message });
        return;
      }
      const key = canonicalNick(result.nick);
      const previous = onlineByNick.get(key);
      if (previous && previous !== socket) previous.close();
      onlineByNick.set(key, socket);
      lobbyNick = result.nick;
      send(socket, { type: "lobby-ok", nick: result.nick, friends: friendListFor(result.nick) });
      broadcastPresenceChange(result.nick);
      return;
    }

    if (message.type === "add-friend") {
      if (!lobbyNick) {
        send(socket, { type: "lobby-error", message: "Faça login primeiro" });
        return;
      }
      const result = lobbyStore.addFriend(lobbyNick, message.nick);
      if (!result.ok) {
        send(socket, { type: "lobby-error", message: result.message });
        return;
      }
      send(socket, { type: "friends", friends: friendListFor(lobbyNick) });
      // The new friend (if online) instantly sees the friendship too.
      const friendSocket = onlineByNick.get(canonicalNick(result.friendNick));
      if (friendSocket) {
        send(friendSocket, { type: "friends", friends: friendListFor(result.friendNick) });
      }
      return;
    }

    if (message.type === "invite-friend") {
      if (!lobbyNick) {
        send(socket, { type: "lobby-error", message: "Faça login primeiro" });
        return;
      }
      // Only friends can push invites onto someone's screen — anyone else
      // still has the shareable link, which requires the recipient to act.
      if (!lobbyStore.areFriends(lobbyNick, message.nick)) {
        send(socket, { type: "lobby-error", message: `Adicione ${message.nick} como amigo antes de convidar` });
        return;
      }
      const friendSocket = onlineByNick.get(canonicalNick(message.nick));
      if (!friendSocket) {
        send(socket, { type: "lobby-error", message: `${message.nick} não está online` });
        return;
      }
      send(friendSocket, {
        type: "room-invite",
        from: lobbyNick,
        inviteUrl: message.inviteUrl,
        roomCode: message.roomCode,
      });
      return;
    }
  });

  socket.on("close", () => {
    if (lobbyNick && onlineByNick.get(canonicalNick(lobbyNick)) === socket) {
      onlineByNick.delete(canonicalNick(lobbyNick));
      broadcastPresenceChange(lobbyNick);
    }
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

/** Invite URLs are navigated to on the recipient's browser — http(s) only. */
function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
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

  if (candidate.type === "lobby-login") {
    if (typeof candidate.nick !== "string" || !isValidNick(candidate.nick)) return null;
    if (typeof candidate.token !== "string" || !candidate.token) return null;
    return { type: "lobby-login", nick: candidate.nick, token: candidate.token };
  }

  if (candidate.type === "add-friend") {
    if (typeof candidate.nick !== "string" || !isValidNick(candidate.nick)) return null;
    return { type: "add-friend", nick: candidate.nick };
  }

  if (candidate.type === "invite-friend") {
    if (typeof candidate.nick !== "string" || !isValidNick(candidate.nick)) return null;
    if (typeof candidate.inviteUrl !== "string" || candidate.inviteUrl.length > 2048) return null;
    if (!isHttpUrl(candidate.inviteUrl)) return null;
    if (typeof candidate.roomCode !== "string" || candidate.roomCode.length > 32) return null;
    return {
      type: "invite-friend",
      nick: candidate.nick,
      inviteUrl: candidate.inviteUrl,
      roomCode: candidate.roomCode,
    };
  }

  return null;
}

function send(socket: WebSocket, message: ServerToClientMessage): void {
  socket.send(JSON.stringify(message));
}

// eslint-disable-next-line no-console
console.log(`[signaling] listening on ws://localhost:${PORT}`);
