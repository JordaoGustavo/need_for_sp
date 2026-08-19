import { getAudioContext, getMasterGain } from "./audioEngine";

/**
 * Mechanical garage sounds for the car-swap platform animation (ADR 0010):
 * a metallic sliding/servo noise while the platforms move, and a heavy metal
 * clank when the incoming platform docks. All synthesized — no audio files.
 */

/** Metal-on-metal sliding + low servo rumble, lasting the whole platform move. */
export function playPlatformSlide(durationSeconds: number): void {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  // Metallic scrape: band-passed noise, faded in and out with the motion.
  const noise = buildNoiseSource(ctx, durationSeconds + 0.1);
  const scrape = ctx.createBiquadFilter();
  scrape.type = "bandpass";
  scrape.frequency.setValueAtTime(1600, now);
  scrape.frequency.linearRampToValueAtTime(900, now + durationSeconds);
  scrape.Q.value = 2.5;
  const scrapeGain = ctx.createGain();
  scrapeGain.gain.setValueAtTime(0.0001, now);
  scrapeGain.gain.exponentialRampToValueAtTime(0.06, now + 0.08);
  scrapeGain.gain.setValueAtTime(0.06, now + durationSeconds * 0.7);
  scrapeGain.gain.exponentialRampToValueAtTime(0.0001, now + durationSeconds);
  noise.connect(scrape).connect(scrapeGain).connect(getMasterGain());

  // Servo/motor rumble underneath.
  const rumble = ctx.createOscillator();
  rumble.type = "sawtooth";
  rumble.frequency.setValueAtTime(46, now);
  rumble.frequency.linearRampToValueAtTime(38, now + durationSeconds);
  const rumbleFilter = ctx.createBiquadFilter();
  rumbleFilter.type = "lowpass";
  rumbleFilter.frequency.value = 160;
  const rumbleGain = ctx.createGain();
  rumbleGain.gain.setValueAtTime(0.0001, now);
  rumbleGain.gain.exponentialRampToValueAtTime(0.12, now + 0.06);
  rumbleGain.gain.setValueAtTime(0.12, now + durationSeconds * 0.75);
  rumbleGain.gain.exponentialRampToValueAtTime(0.0001, now + durationSeconds);
  rumble.connect(rumbleFilter).connect(rumbleGain).connect(getMasterGain());

  noise.start(now);
  noise.stop(now + durationSeconds + 0.1);
  rumble.start(now);
  rumble.stop(now + durationSeconds + 0.05);
}

/** Heavy metallic clank as the platform locks into place. */
export function playPlatformDock(): void {
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = 1;
  out.connect(getMasterGain());

  // Inharmonic ringing partials give it the "iron" character.
  const partials: ReadonlyArray<readonly [number, number, number]> = [
    // [frequency Hz, peak gain, decay seconds]
    [211, 0.16, 0.28],
    [317, 0.12, 0.22],
    [587, 0.09, 0.16],
    [809, 0.06, 0.12],
    [1244, 0.04, 0.09],
  ];
  for (const [frequency, peak, decay] of partials) {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peak, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
    osc.connect(gain).connect(out);
    osc.start(now);
    osc.stop(now + decay + 0.05);
  }

  // Impact thud + click.
  const noise = buildNoiseSource(ctx, 0.12);
  const impact = ctx.createBiquadFilter();
  impact.type = "lowpass";
  impact.frequency.value = 900;
  const impactGain = ctx.createGain();
  impactGain.gain.setValueAtTime(0.3, now);
  impactGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
  noise.connect(impact).connect(impactGain).connect(out);
  noise.start(now);
  noise.stop(now + 0.12);
}

function buildNoiseSource(ctx: AudioContext, durationSeconds: number): AudioBufferSourceNode {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * durationSeconds), ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  return source;
}
