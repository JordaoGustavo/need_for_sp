/**
 * Local player identity for the lobby (friends) system. The nickname is chosen
 * by the player; the token is a locally generated secret that proves to the
 * server this browser owns the nick (nicks are globally unique — see
 * server/lobbyStore.ts). Both live in localStorage.
 */

const NICK_KEY = "nfsp.nick";
const TOKEN_KEY = "nfsp.nickToken";

export function getSavedNick(): string | null {
  try {
    return localStorage.getItem(NICK_KEY);
  } catch {
    return null;
  }
}

export function saveNick(nick: string): void {
  try {
    localStorage.setItem(NICK_KEY, nick);
  } catch {
    // Private mode etc. — identity just won't persist.
  }
}

export function getIdentityToken(): string {
  try {
    const existing = localStorage.getItem(TOKEN_KEY);
    if (existing) return existing;
    const token = crypto.randomUUID();
    localStorage.setItem(TOKEN_KEY, token);
    return token;
  } catch {
    return "volatile-" + Math.random().toString(36).slice(2);
  }
}
