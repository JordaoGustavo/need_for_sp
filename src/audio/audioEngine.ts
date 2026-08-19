/**
 * Single WebAudio context + master gain for the whole game (ADR 0010).
 * Browsers keep an AudioContext suspended until a user gesture, so anything
 * that wants to start audio proactively goes through whenAudioUnlocked().
 */

let context: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

export function getAudioContext(): AudioContext {
  if (!context) {
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(context.destination);
  }
  if (context.state === "suspended") void context.resume();
  return context;
}

export function getMasterGain(): GainNode {
  getAudioContext();
  return master!;
}

/** Runs `callback` once audio is allowed to play — immediately if it already is. */
export function whenAudioUnlocked(callback: () => void): void {
  if (context && context.state === "running") {
    callback();
    return;
  }
  const unlock = (): void => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    getAudioContext();
    callback();
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

/** Toggles the global mute (bound to the M key in main.ts). Returns the new muted state. */
export function toggleMute(): boolean {
  muted = !muted;
  if (master && context) {
    master.gain.setTargetAtTime(muted ? 0 : 1, context.currentTime, 0.05);
  }
  return muted;
}
