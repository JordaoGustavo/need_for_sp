import type { CarSoundProfile } from "../domain/car";
import { getAudioContext, getMasterGain } from "./audioEngine";

/**
 * Synthesized engine voice for one car (ADR 0010). Two detuned oscillators
 * (fundamental + sub-octave) through a low-pass filter whose cutoff opens with
 * RPM; the CarSoundProfile content data (base frequency, detune, brightness)
 * is what makes each car sound different. Call update() every frame with the
 * car's RPM fraction; volume lets the race screen attenuate the remote car's
 * engine by distance.
 */
export class EngineSound {
  private readonly ctx = getAudioContext();
  private readonly fundamental: OscillatorNode;
  private readonly subOctave: OscillatorNode;
  private readonly filter: BiquadFilterNode;
  private readonly gain: GainNode;
  private disposed = false;

  constructor(private readonly profile: CarSoundProfile) {
    this.fundamental = this.ctx.createOscillator();
    this.fundamental.type = "sawtooth";
    this.fundamental.detune.value = profile.detuneCents;

    this.subOctave = this.ctx.createOscillator();
    this.subOctave.type = "square";

    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.Q.value = 1.2;

    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0;

    this.fundamental.connect(this.filter);
    this.subOctave.connect(this.filter);
    this.filter.connect(this.gain).connect(getMasterGain());

    this.update(0, 0);
    this.fundamental.start();
    this.subOctave.start();
  }

  /**
   * @param rpmFraction current RPM as a 0..1 fraction of the redline
   * @param volume 0..1 loudness (distance attenuation for the remote car)
   */
  update(rpmFraction: number, volume: number): void {
    if (this.disposed) return;
    const rpm = Math.min(1, Math.max(0, rpmFraction));
    const now = this.ctx.currentTime;

    const frequency = this.profile.baseFrequencyHz * (0.6 + rpm * 2.9);
    this.fundamental.frequency.setTargetAtTime(frequency, now, 0.04);
    this.subOctave.frequency.setTargetAtTime(frequency / 2, now, 0.04);

    const cutoff = this.profile.baseFrequencyHz * this.profile.brightness * (0.35 + rpm * 0.65);
    this.filter.frequency.setTargetAtTime(cutoff, now, 0.06);

    const loudness = volume * (0.05 + rpm * 0.12);
    this.gain.gain.setTargetAtTime(loudness, now, 0.08);
  }

  /**
   * Ignition cut (rev limiter): kills the engine voice instantly — the next
   * update() ramps it back — and fires a short exhaust pop. Called on the
   * frames the limiter triggers; at ~10Hz this makes the classic "brap-brap".
   */
  cut(): void {
    if (this.disposed) return;
    const now = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(0.0001, now);
    this.playExhaustPop();
  }

  private playExhaustPop(): void {
    const durationSeconds = 0.06;
    const buffer = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * durationSeconds), this.ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const pop = this.ctx.createBiquadFilter();
    pop.type = "lowpass";
    pop.frequency.value = 750;

    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSeconds);

    noise.connect(pop).connect(gain).connect(getMasterGain());
    noise.start(now);
    noise.stop(now + durationSeconds + 0.02);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const now = this.ctx.currentTime;
    this.gain.gain.setTargetAtTime(0, now, 0.05);
    this.fundamental.stop(now + 0.3);
    this.subOctave.stop(now + 0.3);
  }
}
