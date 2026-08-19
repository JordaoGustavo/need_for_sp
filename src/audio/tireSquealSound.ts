import { getAudioContext, getMasterGain } from "./audioEngine";

/**
 * Continuous tire-squeal voice (ADR 0010): band-passed noise with a wobbling
 * center frequency — the classic screech. The race screen drives `update()`
 * every frame with an intensity (launch wheelspin, hard braking); 0 fades out.
 */
export class TireSquealSound {
  private readonly ctx = getAudioContext();
  private readonly noise: AudioBufferSourceNode;
  private readonly wobble: OscillatorNode;
  private readonly gain: GainNode;
  private disposed = false;

  constructor() {
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    this.noise = this.ctx.createBufferSource();
    this.noise.buffer = buffer;
    this.noise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1050;
    filter.Q.value = 9;

    // Slow warble on the squeal pitch keeps it organic instead of a pure hiss.
    this.wobble = this.ctx.createOscillator();
    this.wobble.frequency.value = 11;
    const wobbleDepth = this.ctx.createGain();
    wobbleDepth.gain.value = 140;
    this.wobble.connect(wobbleDepth).connect(filter.frequency);

    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0;

    this.noise.connect(filter).connect(this.gain).connect(getMasterGain());
    this.noise.start();
    this.wobble.start();
  }

  /** @param intensity 0..1 — how hard the tires are being tortured right now. */
  update(intensity: number): void {
    if (this.disposed) return;
    const clamped = Math.min(1, Math.max(0, intensity));
    this.gain.gain.setTargetAtTime(clamped * 0.14, this.ctx.currentTime, 0.06);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const now = this.ctx.currentTime;
    this.gain.gain.setTargetAtTime(0, now, 0.05);
    this.noise.stop(now + 0.3);
    this.wobble.stop(now + 0.3);
  }
}
