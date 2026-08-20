import type { FriendInfo, ServerToClientMessage } from "./signalingProtocol";
import { defaultSignalingUrl } from "../config";
import { getIdentityToken, getSavedNick, saveNick } from "../game/playerIdentity";

/**
 * Long-lived connection to the signaling server's lobby layer: claims/logs
 * into the player's unique nickname, keeps the friend list (with presence)
 * fresh, and relays room invites. One module-level instance serves the whole
 * app — menu screens subscribe to it (see friendsWidget.ts).
 */

export interface RoomInvite {
  readonly from: string;
  readonly inviteUrl: string;
  readonly roomCode: string;
}

export type LobbyState =
  | { kind: "no-nick" }
  | { kind: "connecting"; nick: string }
  | { kind: "online"; nick: string; friends: readonly FriendInfo[] }
  | { kind: "error"; nick: string; message: string };

type Listener = (state: LobbyState) => void;
type InviteListener = (invite: RoomInvite) => void;
type NoticeListener = (message: string) => void;

const RECONNECT_DELAY_MS = 3000;

class LobbyClient {
  private socket: WebSocket | null = null;
  private state: LobbyState;
  private readonly listeners = new Set<Listener>();
  private readonly inviteListeners = new Set<InviteListener>();
  private readonly noticeListeners = new Set<NoticeListener>();
  private reconnectTimer: number | null = null;

  constructor() {
    const nick = getSavedNick();
    this.state = nick ? { kind: "connecting", nick } : { kind: "no-nick" };
    if (nick) this.connect(nick);
  }

  getState(): LobbyState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  onInvite(listener: InviteListener): () => void {
    this.inviteListeners.add(listener);
    return () => this.inviteListeners.delete(listener);
  }

  /** Transient errors while online (e.g. "nick não existe" on add-friend). */
  onNotice(listener: NoticeListener): () => void {
    this.noticeListeners.add(listener);
    return () => this.noticeListeners.delete(listener);
  }

  /** Claims (or logs back into) a nickname. Persisted only after lobby-ok. */
  setNick(nick: string): void {
    this.connect(nick);
  }

  addFriend(nick: string): void {
    this.send({ type: "add-friend", nick });
  }

  inviteFriend(nick: string, inviteUrl: string, roomCode: string): void {
    this.send({ type: "invite-friend", nick, inviteUrl, roomCode });
  }

  private connect(nick: string): void {
    this.socket?.close();
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.setState({ kind: "connecting", nick });

    const socket = new WebSocket(defaultSignalingUrl());
    this.socket = socket;

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ type: "lobby-login", nick, token: getIdentityToken() }));
    });
    socket.addEventListener("message", (event) => {
      this.handleMessage(nick, JSON.parse(String(event.data)) as ServerToClientMessage);
    });
    socket.addEventListener("close", () => {
      if (this.socket !== socket) return; // superseded by a newer connection
      this.socket = null;
      // Nick rejected (someone else owns it): stay in error, don't hammer.
      if (this.state.kind === "error") return;
      this.setState({ kind: "connecting", nick });
      this.reconnectTimer = window.setTimeout(() => this.connect(nick), RECONNECT_DELAY_MS);
    });
  }

  private handleMessage(nick: string, message: ServerToClientMessage): void {
    switch (message.type) {
      case "lobby-ok":
        // Only a confirmed nick is saved — a rejected one must not be retried
        // on every page load.
        saveNick(message.nick);
        this.setState({ kind: "online", nick: message.nick, friends: message.friends });
        return;
      case "friends":
        if (this.state.kind === "online") {
          this.setState({ ...this.state, friends: message.friends });
        }
        return;
      case "lobby-error":
        // Before login succeeds this is fatal (nick taken); afterwards it's a
        // transient notice (bad add-friend/invite) and we stay online.
        if (this.state.kind === "online") {
          for (const listener of this.noticeListeners) listener(message.message);
        } else {
          this.setState({ kind: "error", nick, message: message.message });
        }
        return;
      case "room-invite":
        for (const listener of this.inviteListeners) {
          listener({ from: message.from, inviteUrl: message.inviteUrl, roomCode: message.roomCode });
        }
        return;
      default:
        return;
    }
  }

  private send(message: object): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  private setState(state: LobbyState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}

let instance: LobbyClient | null = null;

export function getLobby(): LobbyClient {
  if (!instance) instance = new LobbyClient();
  return instance;
}
