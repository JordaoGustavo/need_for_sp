/**
 * The chosen speedometer style survives page reloads (every race ends with a
 * full reload — see raceScreen onExit), so it lives in localStorage rather
 * than in the screen state machine.
 */
const STORAGE_KEY = "nfsp.hudSkinId";

export function loadHudSkinId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveHudSkinId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Private mode / blocked storage: the game falls back to the default skin.
  }
}
