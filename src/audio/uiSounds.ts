import { getAudioContext, getMasterGain } from "./audioEngine";

/**
 * Synthesized NFSU2-style menu blips (ADR 0010): short, dry, slightly metallic.
 * All generated with plain oscillators — no audio files.
 */

export function playHover(): void {
  blip(1150, 0.045, "square", 0.05);
}

export function playSelect(): void {
  blip(660, 0.06, "square", 0.09);
  blip(990, 0.08, "square", 0.07, 0.03);
}

export function playConfirm(): void {
  sweep(330, 990, 0.22, "sawtooth", 0.12);
}

export function playBack(): void {
  sweep(660, 330, 0.15, "square", 0.08);
}

function blip(
  frequencyHz: number,
  durationSeconds: number,
  type: OscillatorType,
  peakGain: number,
  delaySeconds = 0,
): void {
  const ctx = getAudioContext();
  const start = ctx.currentTime + delaySeconds;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = frequencyHz;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(peakGain, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + durationSeconds);

  osc.connect(gain).connect(getMasterGain());
  osc.start(start);
  osc.stop(start + durationSeconds + 0.02);
}

function sweep(
  fromHz: number,
  toHz: number,
  durationSeconds: number,
  type: OscillatorType,
  peakGain: number,
): void {
  const ctx = getAudioContext();
  const start = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(fromHz, start);
  osc.frequency.exponentialRampToValueAtTime(toHz, start + durationSeconds);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(peakGain, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + durationSeconds);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 3200;

  osc.connect(filter).connect(gain).connect(getMasterGain());
  osc.start(start);
  osc.stop(start + durationSeconds + 0.02);
}
