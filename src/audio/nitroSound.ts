import { getAudioContext, getMasterGain } from "./audioEngine";

/**
 * Continuous NOS spray hiss (ADR 0010): high-passed noise with a slight
 * whistle, gated by the nitro button. Call update() every frame.
 */
export class NitroSound {
  private readonly ctx = getAudioContext();
  private readonly noise: AudioBufferSourceNode;
  private readonly gain: GainNode;
  private disposed = false;

  constructor() {
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 1, this.ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    this.noise = this.ctx.createBufferSource();
    this.noise.buffer = buffer;
    this.noise.loop = true;

    const hiss = this.ctx.createBiquadFilter();
    hiss.type = "highpass";
    hiss.frequency.value = 3200;

    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0;

    this.noise.connect(hiss).connect(this.gain).connect(getMasterGain());
    this.noise.start();
  }

  update(active: boolean): void {
    if (this.disposed) return;
    this.gain.gain.setTargetAtTime(active ? 0.09 : 0, this.ctx.currentTime, 0.04);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.04);
    this.noise.stop(this.ctx.currentTime + 0.2);
  }
}
