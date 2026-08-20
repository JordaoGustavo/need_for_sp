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

let cachedToken: string | null = null;

export function getIdentityToken(): string {
  if (cachedToken) return cachedToken;
  try {
    const existing = localStorage.getItem(TOKEN_KEY);
    if (existing) {
      cachedToken = existing;
      return existing;
    }
  } catch {
    // Storage unavailable (private mode) — fall through to a fresh token.
  }
  const token = generateToken();
  cachedToken = token;
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Not persisted, but the in-memory cache keeps it stable for this page.
  }
  return token;
}

/**
 * crypto.randomUUID is secure-context-only, so it does not exist when a friend
 * opens the game via http://<ip>:5173 (the normal multiplayer setup) — that
 * used to burn the nick with a throwaway token on every reload.
 * crypto.getRandomValues works on insecure origins too.
 */
function generateToken(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
