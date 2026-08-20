import { getAudioContext, getMasterGain, whenAudioUnlocked } from "./audioEngine";

/**
 * Menu music (ADR 0010). Plays `public/audio/menu-theme.mp3` on loop if the
 * file exists — that's where the player drops their own licensed track (e.g. a
 * copy of "Riders on the Storm"; we do NOT bundle copyrighted music with the
 * game). When the file is absent, falls back to an original synthesized
 * "night storm" ambience so the menu is never silent.
 */

const MENU_MUSIC_URL = "/audio/menu-theme.mp3";
const MUSIC_GAIN = 0.45;

interface ActiveMusic {
  stop(fadeSeconds: number): void;
}

let active: ActiveMusic | null = null;
let starting = false;
let stopped = false;

/** Idempotent: safe to call on every menu screen transition. */
export function ensureMenuMusic(): void {
  stopped = false;
  if (active || starting) return;
  starting = true;
  whenAudioUnlocked(() => {
    void begin();
  });
}

export function stopMenuMusic(fadeSeconds = 0.8): void {
  stopped = true;
  active?.stop(fadeSeconds);
  active = null;
}

async function begin(): Promise<void> {
  try {
    const fileTrack = await tryStartFileTrack();
    if (!fileTrack) {
      console.info(`[menuMusic] ${MENU_MUSIC_URL} indisponível — usando ambiência de chuva`);
    }
    const music = fileTrack ?? startStormAmbience();
    if (stopped) {
      music.stop(0);
      return;
    }
    active = music;
  } finally {
    starting = false;
  }
}

async function tryStartFileTrack(): Promise<ActiveMusic | null> {
  const ctx = getAudioContext();
  let buffer: AudioBuffer;
  try {
    const response = await fetch(MENU_MUSIC_URL);
    if (!response.ok) return null;
    const bytes = await response.arrayBuffer();
    buffer = await ctx.decodeAudioData(bytes);
  } catch {
    return null;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(MUSIC_GAIN, ctx.currentTime + 1.5);

  source.connect(gain).connect(getMasterGain());
  source.start();

  return {
    stop(fadeSeconds: number): void {
      gain.gain.setTargetAtTime(0, ctx.currentTime, Math.max(0.01, fadeSeconds / 3));
      source.stop(ctx.currentTime + fadeSeconds + 0.1);
    },
  };
}

/**
 * Fallback ambience: rain (filtered noise) over a slow, dark minor drone.
 * Deliberately generic — evokes the stormy mood, copies no melody.
 */
function startStormAmbience(): ActiveMusic {
  const ctx = getAudioContext();
  const out = ctx.createGain();
  out.gain.setValueAtTime(0, ctx.currentTime);
  out.gain.linearRampToValueAtTime(MUSIC_GAIN * 0.6, ctx.currentTime + 2.5);
  out.connect(getMasterGain());

  // Rain: looped white noise through a band-pass, with a slow level wobble.
  const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const samples = noiseBuffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;
  noise.loop = true;
  const rainFilter = ctx.createBiquadFilter();
  rainFilter.type = "bandpass";
  rainFilter.frequency.value = 2400;
  rainFilter.Q.value = 0.4;
  const rainGain = ctx.createGain();
  rainGain.gain.value = 0.16;
  const rainLfo = ctx.createOscillator();
  rainLfo.frequency.value = 0.07;
  const rainLfoDepth = ctx.createGain();
  rainLfoDepth.gain.value = 0.05;
  rainLfo.connect(rainLfoDepth).connect(rainGain.gain);
  noise.connect(rainFilter).connect(rainGain).connect(out);

  // Drone: three detuned oscillators on a D minor color (D2, A2, F3).
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.05;
  const droneFilter = ctx.createBiquadFilter();
  droneFilter.type = "lowpass";
  droneFilter.frequency.value = 420;
  droneGain.connect(droneFilter).connect(out);

  const oscillators: OscillatorNode[] = [noiseAsOsc(noise)];
  for (const [freq, detune] of [
    [73.42, -4],
    [110.0, 3],
    [174.61, -6],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    osc.detune.value = detune;
    osc.connect(droneGain);
    osc.start();
    oscillators.push(osc);
  }
  noise.start();
  rainLfo.start();
  oscillators.push(rainLfo);

  return {
    stop(fadeSeconds: number): void {
      out.gain.setTargetAtTime(0, ctx.currentTime, Math.max(0.01, fadeSeconds / 3));
      const stopAt = ctx.currentTime + fadeSeconds + 0.1;
      for (const osc of oscillators) osc.stop(stopAt);
    },
  };
}

/** Both OscillatorNode and AudioBufferSourceNode expose stop(); unify the type. */
function noiseAsOsc(node: AudioBufferSourceNode): OscillatorNode {
  return node as unknown as OscillatorNode;
}
