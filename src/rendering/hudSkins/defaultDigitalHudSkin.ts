import type { HudSkin, HudState } from "../../domain/hud";

/**
 * Default HudSkin implementation shipped in the MVP (ADR 0006). Any future skin only
 * needs to implement HudSkin — the race screen never needs to change.
 */
export class DefaultDigitalHudSkin implements HudSkin {
  readonly id = "default-digital";
  readonly displayName = "Digital Padrão";

  render(
    ctx: CanvasRenderingContext2D,
    state: HudState,
    rect: { x: number; y: number; width: number; height: number },
  ): void {
    const { x, y, width, height } = rect;

    ctx.save();
    ctx.fillStyle = "rgba(10, 10, 16, 0.75)";
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = "#ff5a1f";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);

    this.drawTachometer(ctx, state, x + width * 0.28, y + height / 2, height * 0.42);
    this.drawSpeedometer(ctx, state, x + width * 0.72, y + height / 2, height * 0.42);

    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${Math.floor(height * 0.28)}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`M${state.gear}`, x + width / 2, y + height / 2);

    ctx.restore();
  }

  private drawTachometer(
    ctx: CanvasRenderingContext2D,
    state: HudState,
    cx: number,
    cy: number,
    radius: number,
  ): void {
    const fraction = clamp01(state.rpm / state.maxRpm);
    this.drawGauge(ctx, cx, cy, radius, fraction, "#ff5a1f", `${Math.round(state.rpm)}`, "RPM");
  }

  private drawSpeedometer(
    ctx: CanvasRenderingContext2D,
    state: HudState,
    cx: number,
    cy: number,
    radius: number,
  ): void {
    const referenceMaxKmh = 260;
    const fraction = clamp01(state.speedKmh / referenceMaxKmh);
    this.drawGauge(
      ctx,
      cx,
      cy,
      radius,
      fraction,
      "#1fa2ff",
      `${Math.round(state.speedKmh)}`,
      "KM/H",
    );
  }

  private drawGauge(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
    fraction: number,
    color: string,
    valueLabel: string,
    unitLabel: string,
  ): void {
    const startAngle = Math.PI * 0.75;
    const endAngle = Math.PI * 2.25;
    const sweep = endAngle - startAngle;

    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = radius * 0.16;
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = radius * 0.16;
    ctx.arc(cx, cy, radius, startAngle, startAngle + sweep * fraction);
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${Math.floor(radius * 0.42)}px monospace`;
    ctx.fillText(valueLabel, cx, cy - radius * 0.1);
    ctx.font = `${Math.floor(radius * 0.2)}px monospace`;
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText(unitLabel, cx, cy + radius * 0.35);
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
