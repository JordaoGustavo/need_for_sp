import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { isValidNick } from "../src/net/signalingProtocol";

/**
 * Persistent nickname + friends registry for the lobby layer of the signaling
 * server. Nicknames are globally unique (case-insensitive); a nick is claimed
 * with a client-generated secret token, and only that token can log into it
 * again. Friendships are mutual and stored by canonical (lower-case) key.
 *
 * Persistence is a single JSON file next to the server — deliberately simple
 * for the self-hosted setup this game runs on (ADR 0003: the server holds no
 * race state; this is the only thing it remembers).
 */

interface UserRecord {
  /** Nick with the casing chosen at registration (shown to other players). */
  nick: string;
  token: string;
  friends: string[]; // canonical keys
}

export type LoginResult =
  | { ok: true; nick: string }
  | { ok: false; message: string };

export type AddFriendResult =
  | { ok: true; friendNick: string }
  | { ok: false; message: string };

export function canonicalNick(nick: string): string {
  return nick.toLowerCase();
}

export class LobbyStore {
  private readonly users = new Map<string, UserRecord>();

  constructor(private readonly filePath: string | null = null) {
    if (!filePath) return;
    try {
      const parsed = JSON.parse(readFileSync(filePath, "utf8")) as {
        users?: Record<string, UserRecord>;
      };
      for (const [key, record] of Object.entries(parsed.users ?? {})) {
        this.users.set(key, record);
      }
    } catch {
      // Missing/corrupt file: start empty; the first save recreates it.
    }
  }

  /** Registers the nick when free, or authenticates when the token matches. */
  login(nick: string, token: string): LoginResult {
    if (!isValidNick(nick)) {
      return { ok: false, message: "Nick inválido: use 3–16 letras, números ou _" };
    }
    if (typeof token !== "string" || token.length < 8) {
      return { ok: false, message: "Token inválido" };
    }
    const key = canonicalNick(nick);
    const existing = this.users.get(key);
    if (!existing) {
      this.users.set(key, { nick, token, friends: [] });
      this.save();
      return { ok: true, nick };
    }
    if (existing.token !== token) {
      return { ok: false, message: `O nick "${existing.nick}" já pertence a outra pessoa` };
    }
    return { ok: true, nick: existing.nick };
  }

  /** Mutual friendship: both users see each other after one add. */
  areFriends(nickA: string, nickB: string): boolean {
    const a = this.users.get(canonicalNick(nickA));
    return a !== undefined && a.friends.includes(canonicalNick(nickB));
  }

  addFriend(ownerNick: string, friendNick: string): AddFriendResult {
    const ownerKey = canonicalNick(ownerNick);
    const friendKey = canonicalNick(friendNick);
    const owner = this.users.get(ownerKey);
    const friend = this.users.get(friendKey);
    if (!owner) return { ok: false, message: "Faça login primeiro" };
    if (!friend) return { ok: false, message: `Nick "${friendNick}" não existe` };
    if (ownerKey === friendKey) return { ok: false, message: "Você não pode adicionar a si mesmo" };
    if (!owner.friends.includes(friendKey)) owner.friends.push(friendKey);
    if (!friend.friends.includes(ownerKey)) friend.friends.push(ownerKey);
    this.save();
    return { ok: true, friendNick: friend.nick };
  }

  friendsOf(nick: string): readonly string[] {
    const user = this.users.get(canonicalNick(nick));
    if (!user) return [];
    return user.friends
      .map((key) => this.users.get(key)?.nick)
      .filter((n): n is string => typeof n === "string");
  }

  displayNick(nick: string): string | null {
    return this.users.get(canonicalNick(nick))?.nick ?? null;
  }

  private save(): void {
    if (!this.filePath) return;
    try {
      // Owner-only: the file holds identity tokens (credentials).
      writeFileSync(this.filePath, JSON.stringify({ users: Object.fromEntries(this.users) }, null, 2), {
        mode: 0o600,
      });
      chmodSync(this.filePath, 0o600);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[lobby] failed to persist store", error);
    }
  }
}
