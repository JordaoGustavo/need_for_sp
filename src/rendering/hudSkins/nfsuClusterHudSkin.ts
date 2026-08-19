import type { HudSkin, HudState } from "../../domain/hud";

/**
 * NFSU2-style gauge cluster (ADR 0006 HudSkin): a large analog tachometer with
 * needle on the right edge — digital gear + speed readout inside the dial, a
 * decorative N2O arc — and a small boost gauge beside it. Draws only the
 * cluster (no full-width panel), anchored to the rect's bottom-right corner.
 *
 * Stateful on purpose: the boost needle is driven by acceleration, estimated
 * from consecutive speed readings (HudState carries no acceleration).
 */
export class NfsuClusterHudSkin implements HudSkin {
  readonly id = "nfsu-cluster";
  readonly displayName = "Cluster NFSU";

  private lastSpeedKmh = 0;
  private lastSampleMs = 0;
  private smoothedBoost = 0;

  render(
    ctx: CanvasRenderingContext2D,
    state: HudState,
    rect: { x: number; y: number; width: number; height: number },
  ): void {
    const radius = Math.min(rect.height * 0.52, rect.width * 0.2);
    // 1.45× keeps the N2O arc and its label (drawn at ~1.32× the radius) on screen.
    const cx = rect.x + rect.width - radius * 1.45;
    const cy = rect.y + rect.height - radius - 16;

    ctx.save();
    this.drawTachometer(ctx, state, cx, cy, radius);
    this.drawBoostGauge(ctx, cx - radius - radius * 0.62, cy + radius * 0.3, radius * 0.42);
    ctx.restore();

    this.sampleBoost(state);
  }

  // --- tachometer -----------------------------------------------------------

  private drawTachometer(
    ctx: CanvasRenderingContext2D,
    state: HudState,
    cx: number,
    cy: number,
    radius: number,
  ): void {
    const startAngle = Math.PI * 0.75; // "0" mark, lower-left
    const sweep = Math.PI * 1.5;
    const rpmFraction = clamp01(state.rpm / state.maxRpm);

    // Face
    const face = ctx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius);
    face.addColorStop(0, "rgba(30,33,40,0.92)");
    face.addColorStop(1, "rgba(8,10,14,0.92)");
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Silver bezel
    ctx.strokeStyle = "rgba(210,215,225,0.9)";
    ctx.lineWidth = radius * 0.05;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.98, 0, Math.PI * 2);
    ctx.stroke();

    // Decorative N2O arc (outside the bezel, over the high-rpm region)
    ctx.strokeStyle = "#37c4ff";
    ctx.lineWidth = radius * 0.09;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.1, startAngle + sweep * 0.55, startAngle + sweep * 0.98);
    ctx.stroke();
    ctx.fillStyle = "#37c4ff";
    ctx.font = `bold italic ${Math.floor(radius * 0.17)}px 'Chakra Petch', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const n2oAngle = startAngle + sweep * 0.62;
    ctx.fillText("N2O", cx + Math.cos(n2oAngle) * radius * 1.32, cy + Math.sin(n2oAngle) * radius * 1.32);

    // Ticks + numbers scaled to this car's dial (e.g. 0..8 for a 8000rpm dial,
    // 0..9 for the Supra's 9000), red from the car's real redline onward.
    const dialMarks = Math.max(1, Math.round(state.maxRpm / 1000));
    for (let mark = 0; mark <= dialMarks; mark++) {
      const angle = startAngle + (mark / dialMarks) * sweep;
      const isRedline = mark * 1000 >= state.redlineRpm;
      const outer = radius * 0.9;
      const inner = radius * 0.78;
      ctx.strokeStyle = isRedline ? "#ff4438" : "rgba(255,255,255,0.9)";
      ctx.lineWidth = radius * 0.025;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      ctx.stroke();

      ctx.fillStyle = isRedline ? "#ff4438" : "#ffffff";
      ctx.font = `bold ${Math.floor(radius * 0.16)}px 'Chakra Petch', sans-serif`;
      ctx.fillText(String(mark), cx + Math.cos(angle) * radius * 0.64, cy + Math.sin(angle) * radius * 0.64);
    }

    // Digital gear + speed inside the dial (right side, like the NFSU2 cluster)
    const textX = cx + radius * 0.38;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.font = `bold ${Math.floor(radius * 0.3)}px 'Chakra Petch', monospace`;
    ctx.fillText(String(state.gear), textX, cy - radius * 0.18);
    ctx.font = `bold ${Math.floor(radius * 0.34)}px 'Chakra Petch', monospace`;
    ctx.fillText(String(Math.round(state.speedKmh)), textX, cy + radius * 0.18);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = `${Math.floor(radius * 0.14)}px 'Chakra Petch', sans-serif`;
    ctx.fillText("KM/H", textX, cy + radius * 0.4);

    this.drawNeedle(ctx, cx, cy, radius * 0.86, startAngle + sweep * rpmFraction);
  }

  private drawNeedle(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    length: number,
    angle: number,
  ): void {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = "#f2f3f5";
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(-length * 0.16, length * 0.03);
    ctx.lineTo(length, 0);
    ctx.lineTo(-length * 0.16, -length * 0.03);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "#c9ccd4";
    ctx.beginPath();
    ctx.arc(cx, cy, length * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- boost gauge ------------------------------------------------------------

  private drawBoostGauge(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
    const startAngle = Math.PI * 0.75;
    const sweep = Math.PI * 1.5;

    const face = ctx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius);
    face.addColorStop(0, "rgba(30,33,40,0.92)");
    face.addColorStop(1, "rgba(8,10,14,0.92)");
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(210,215,225,0.9)";
    ctx.lineWidth = radius * 0.06;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.97, 0, Math.PI * 2);
    ctx.stroke();

    for (let mark = 0; mark <= 6; mark++) {
      const angle = startAngle + (mark / 6) * sweep;
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = radius * 0.035;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * radius * 0.72, cy + Math.sin(angle) * radius * 0.72);
      ctx.lineTo(cx + Math.cos(angle) * radius * 0.86, cy + Math.sin(angle) * radius * 0.86);
      ctx.stroke();
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${Math.floor(radius * 0.24)}px 'Chakra Petch', sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText("30", cx + radius * 0.42, cy - radius * 0.42);
    ctx.fillStyle = "#ff4438";
    ctx.fillText("-30", cx - radius * 0.1, cy + radius * 0.55);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText("0", cx - radius * 0.55, cy - radius * 0.28);

    // Needle: -1..1 boost maps across the sweep, resting at the center mark.
    const fraction = clamp01(this.smoothedBoost * 0.5 + 0.5);
    this.drawNeedle(ctx, cx, cy, radius * 0.8, startAngle + sweep * fraction);
  }

  /** Estimates acceleration from consecutive speed samples to drive the boost needle. */
  private sampleBoost(state: HudState): void {
    const nowMs = performance.now();
    if (this.lastSampleMs > 0) {
      const dtSeconds = Math.max(0.001, (nowMs - this.lastSampleMs) / 1000);
      const accelKmhPerSec = (state.speedKmh - this.lastSpeedKmh) / dtSeconds;
      const target = Math.max(-1, Math.min(1, accelKmhPerSec / 60));
      this.smoothedBoost += (target - this.smoothedBoost) * Math.min(1, dtSeconds * 6);
    }
    this.lastSpeedKmh = state.speedKmh;
    this.lastSampleMs = nowMs;
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
