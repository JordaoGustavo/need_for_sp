import type { HudSkin, HudState } from "../../domain/hud";

/**
 * Visual theme for the NFSU2-style cluster — same layout and needles, different
 * face art and markers, like the "Indicadores personalizados" shop in NFSU2.
 */
export interface ClusterTheme {
  readonly id: string;
  readonly displayName: string;
  /** Dial markers: numbered ticks, plain dots, or small chevrons. */
  readonly markers: "numbers" | "dots" | "chevrons";
  readonly faceArt: "none" | "flames" | "bunny";
  readonly boostArt: "none" | "flames" | "paw";
  readonly faceInner: string;
  readonly faceOuter: string;
  readonly bezelColor: string;
  readonly markerColor: string;
  readonly redlineColor: string;
  readonly needleColor: string;
  readonly nitroCoolColor: string;
}

export const INVADER_THEME: ClusterTheme = {
  id: "nfsu-cluster",
  displayName: "Invader",
  markers: "numbers",
  faceArt: "none",
  boostArt: "none",
  faceInner: "rgba(35,39,48,0.45)",
  faceOuter: "rgba(10,12,16,0.6)",
  bezelColor: "rgba(210,215,225,0.9)",
  markerColor: "rgba(255,255,255,0.9)",
  redlineColor: "#ff4438",
  needleColor: "#f2f3f5",
  nitroCoolColor: "#37c4ff",
};

export const DRAGAO_THEME: ClusterTheme = {
  id: "cluster-dragao",
  displayName: "Dragão",
  markers: "dots",
  faceArt: "flames",
  boostArt: "flames",
  faceInner: "rgba(58,62,68,0.45)",
  faceOuter: "rgba(14,15,18,0.6)",
  bezelColor: "rgba(160,168,180,0.85)",
  markerColor: "rgba(245,247,250,0.95)",
  redlineColor: "#c8262c",
  needleColor: "#d8dbe0",
  nitroCoolColor: "#5e93c4",
};

export const COELHINHO_THEME: ClusterTheme = {
  id: "cluster-coelhinho",
  displayName: "Coelhinho",
  markers: "chevrons",
  faceArt: "bunny",
  boostArt: "paw",
  faceInner: "rgba(74,78,84,0.45)",
  faceOuter: "rgba(18,19,23,0.6)",
  bezelColor: "rgba(240,242,246,0.95)",
  markerColor: "rgba(250,251,253,0.95)",
  redlineColor: "#c8262c",
  needleColor: "#eceef2",
  nitroCoolColor: "#5e93c4",
};

export const CLUSTER_THEMES: readonly ClusterTheme[] = [
  INVADER_THEME,
  DRAGAO_THEME,
  COELHINHO_THEME,
];

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
  readonly id: string;
  readonly displayName: string;

  private lastSpeedKmh = 0;
  private lastSampleMs = 0;
  private smoothedBoost = 0;

  constructor(private readonly theme: ClusterTheme = INVADER_THEME) {
    this.id = theme.id;
    this.displayName = theme.displayName;
  }

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
    const theme = this.theme;
    const startAngle = Math.PI * 0.75; // "0" mark, lower-left
    const sweep = Math.PI * 1.5;
    const rpmFraction = clamp01(state.rpm / state.maxRpm);

    // Face
    const face = ctx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius);
    face.addColorStop(0, theme.faceInner);
    face.addColorStop(1, theme.faceOuter);
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    this.drawFaceArt(ctx, cx, cy, radius);

    // Bezel
    ctx.strokeStyle = theme.bezelColor;
    ctx.lineWidth = radius * 0.05;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.98, 0, Math.PI * 2);
    ctx.stroke();

    // LIVE N2O band hugging the bezel from ~10 o'clock over the top to ~2
    // o'clock, NFSU2-style: length = bottle remaining; color heats up with
    // continuous use (blue -> orange -> red, near-blow).
    const arcStart = startAngle + sweep * 0.24;
    const arcFull = sweep * 0.48;
    ctx.strokeStyle = "rgba(24,32,42,0.55)";
    ctx.lineWidth = radius * 0.13;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.1, arcStart, arcStart + arcFull);
    ctx.stroke();
    if (state.nitroRemaining > 0) {
      const nitroColor =
        state.nitroHeat > 0.66 ? "#ff2e2e" : state.nitroHeat > 0.33 ? "#ff9b2f" : theme.nitroCoolColor;
      ctx.strokeStyle = nitroColor;
      ctx.lineWidth = radius * (state.nitroActive ? 0.15 : 0.13);
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.1, arcStart, arcStart + arcFull * state.nitroRemaining);
      ctx.stroke();
    }
    // Dark tick marks across the band, like the reference gauges.
    ctx.strokeStyle = "rgba(8,12,18,0.65)";
    ctx.lineWidth = radius * 0.018;
    for (let i = 0; i <= 16; i++) {
      const tickAngle = arcStart + (i / 16) * arcFull;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(tickAngle) * radius * 1.045, cy + Math.sin(tickAngle) * radius * 1.045);
      ctx.lineTo(cx + Math.cos(tickAngle) * radius * 1.155, cy + Math.sin(tickAngle) * radius * 1.155);
      ctx.stroke();
    }
    // "N2O" slanted along the tip of the band, like the NFSU2 lettering.
    const n2oAngle = arcStart + arcFull + sweep * 0.055;
    ctx.save();
    ctx.translate(cx + Math.cos(n2oAngle) * radius * 1.12, cy + Math.sin(n2oAngle) * radius * 1.12);
    ctx.rotate(n2oAngle + Math.PI / 2);
    ctx.fillStyle = state.nitroHeat > 0.66 ? "#ff2e2e" : theme.nitroCoolColor;
    ctx.font = `bold italic ${Math.floor(radius * 0.18)}px 'Chakra Petch', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.7)";
    ctx.shadowBlur = 3;
    ctx.fillText("N2O", 0, 0);
    ctx.restore();

    this.drawDialMarkers(ctx, state, cx, cy, radius, startAngle, sweep);

    // Digital readout inside the dial (right side): "▲ N" gear line and a
    // zero-padded speed in the slanted NFSU2 lettering.
    const textX = cx + radius * 0.38;
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,0.75)";
    ctx.shadowBlur = 4;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold italic ${Math.floor(radius * 0.24)}px 'Chakra Petch', sans-serif`;
    ctx.fillText(`▲ ${state.gear}`, textX, cy - radius * 0.2);
    ctx.font = `bold italic ${Math.floor(radius * 0.34)}px 'Chakra Petch', sans-serif`;
    ctx.fillText(String(Math.round(state.speedKmh)).padStart(3, "0"), textX, cy + radius * 0.14);
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = `italic ${Math.floor(radius * 0.15)}px 'Chakra Petch', sans-serif`;
    ctx.fillText("KM/H", textX, cy + radius * 0.38);
    ctx.shadowBlur = 0;

    this.drawNeedle(ctx, cx, cy, radius * 0.86, startAngle + sweep * rpmFraction);
  }

  /**
   * Marks scaled to this car's dial (e.g. 0..8 for an 8000rpm dial, 0..9 for
   * the Supra's 9000), red from the car's real redline onward. Themed clusters
   * swap the numbered ticks for dots or chevrons, plus a red band at the top.
   */
  private drawDialMarkers(
    ctx: CanvasRenderingContext2D,
    state: HudState,
    cx: number,
    cy: number,
    radius: number,
    startAngle: number,
    sweep: number,
  ): void {
    const theme = this.theme;
    const dialMarks = Math.max(1, Math.round(state.maxRpm / 1000));
    const redlineFraction = clamp01(state.redlineRpm / state.maxRpm);

    if (theme.markers !== "numbers") {
      // Red band from the redline to the top of the dial.
      ctx.strokeStyle = theme.redlineColor;
      ctx.lineWidth = radius * 0.06;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.9, startAngle + sweep * redlineFraction, startAngle + sweep);
      ctx.stroke();
    }

    for (let mark = 0; mark <= dialMarks; mark++) {
      const angle = startAngle + (mark / dialMarks) * sweep;
      const isRedline = mark * 1000 >= state.redlineRpm;
      const color = isRedline ? theme.redlineColor : theme.markerColor;

      if (theme.markers === "dots") {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(angle) * radius * 0.78, cy + Math.sin(angle) * radius * 0.78, radius * 0.05, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      if (theme.markers === "chevrons") {
        this.drawChevron(ctx, cx + Math.cos(angle) * radius * 0.8, cy + Math.sin(angle) * radius * 0.8, radius * 0.07, angle, color);
        continue;
      }

      const outer = radius * 0.9;
      const inner = radius * 0.78;
      ctx.strokeStyle = color;
      ctx.lineWidth = radius * 0.025;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.font = `bold ${Math.floor(radius * 0.16)}px 'Chakra Petch', sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(mark), cx + Math.cos(angle) * radius * 0.64, cy + Math.sin(angle) * radius * 0.64);
    }
  }

  /** Small triangle pointing at the dial center. */
  private drawChevron(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    angleToCenter: number,
    color: string,
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angleToCenter + Math.PI);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.7, size * 0.7);
    ctx.lineTo(-size * 0.7, -size * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
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
    ctx.fillStyle = this.theme.needleColor;
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

  // --- themed face art --------------------------------------------------------

  private drawFaceArt(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
    if (this.theme.faceArt === "flames") this.drawFlames(ctx, cx, cy, radius);
    else if (this.theme.faceArt === "bunny") this.drawBunny(ctx, cx, cy, radius);
  }

  /** Gray tribal-flame silhouettes curling up the dial, à la the NFSU2 flame gauges. */
  private drawFlames(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.96, 0, Math.PI * 2);
    ctx.clip();

    // Each tongue: base position/size/lean in dial-radius units, plus a tone.
    const tongues: ReadonlyArray<[number, number, number, number, string]> = [
      [-0.55, 0.85, 0.5, -0.25, "rgba(170,178,190,0.22)"],
      [-0.2, 0.95, 0.75, -0.15, "rgba(120,127,138,0.3)"],
      [0.15, 0.9, 0.6, 0.1, "rgba(180,186,196,0.18)"],
      [-0.4, 0.6, 0.4, -0.3, "rgba(200,205,214,0.14)"],
      [0.05, 0.55, 0.35, 0.2, "rgba(150,157,168,0.2)"],
    ];
    for (const [bx, by, height, lean, tone] of tongues) {
      const baseX = cx + bx * radius;
      const baseY = cy + by * radius;
      const tipX = baseX + lean * radius;
      const tipY = baseY - height * 1.4 * radius;
      const width = height * 0.55 * radius;
      ctx.fillStyle = tone;
      ctx.beginPath();
      ctx.moveTo(baseX - width / 2, baseY);
      ctx.bezierCurveTo(
        baseX - width * 0.7, baseY - height * 0.5 * radius,
        tipX - width * 0.5, tipY + height * 0.5 * radius,
        tipX, tipY,
      );
      ctx.bezierCurveTo(
        tipX + width * 0.15, tipY + height * 0.6 * radius,
        baseX + width * 0.6, baseY - height * 0.4 * radius,
        baseX + width / 2, baseY,
      );
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /** Cartoon bunny face filling the dial, à la NFSU2's joke gauge faces. */
  private drawBunny(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.96, 0, Math.PI * 2);
    ctx.clip();

    const head = "rgba(196,200,208,0.85)";
    const dark = "rgba(28,30,36,0.9)";

    // Ears (one upright, one flopped), drawn before the head so it overlaps them.
    ctx.fillStyle = head;
    this.drawEllipse(ctx, cx - radius * 0.32, cy - radius * 0.72, radius * 0.16, radius * 0.42, -0.15);
    this.drawEllipse(ctx, cx + radius * 0.28, cy - radius * 0.68, radius * 0.16, radius * 0.4, 0.5);
    ctx.fillStyle = "rgba(120,125,134,0.5)";
    this.drawEllipse(ctx, cx - radius * 0.32, cy - radius * 0.68, radius * 0.07, radius * 0.28, -0.15);

    // Head
    ctx.fillStyle = head;
    ctx.beginPath();
    ctx.arc(cx - radius * 0.05, cy + radius * 0.08, radius * 0.62, 0, Math.PI * 2);
    ctx.fill();

    // Eyes: a wink (left) and a round eye (right).
    ctx.strokeStyle = dark;
    ctx.lineWidth = radius * 0.035;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx - radius * 0.28, cy - radius * 0.08, radius * 0.09, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.arc(cx + radius * 0.14, cy - radius * 0.06, radius * 0.07, 0, Math.PI * 2);
    ctx.fill();

    // Nose + tongue
    ctx.beginPath();
    ctx.moveTo(cx - radius * 0.11, cy + radius * 0.14);
    ctx.lineTo(cx - radius * 0.01, cy + radius * 0.14);
    ctx.lineTo(cx - radius * 0.06, cy + radius * 0.22);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(240,242,246,0.95)";
    ctx.beginPath();
    ctx.arc(cx - radius * 0.06, cy + radius * 0.34, radius * 0.09, 0, Math.PI);
    ctx.fill();

    ctx.restore();
  }

  private drawEllipse(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    rx: number,
    ry: number,
    rotation: number,
  ): void {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- boost gauge ------------------------------------------------------------

  private drawBoostGauge(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
    const theme = this.theme;
    const startAngle = Math.PI * 0.75;
    const sweep = Math.PI * 1.5;

    const face = ctx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius);
    face.addColorStop(0, theme.faceInner);
    face.addColorStop(1, theme.faceOuter);
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    if (theme.boostArt === "paw") this.drawPaw(ctx, cx, cy, radius);
    else if (theme.boostArt === "flames") this.drawFlames(ctx, cx, cy, radius);

    ctx.strokeStyle = theme.bezelColor;
    ctx.lineWidth = radius * 0.06;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.97, 0, Math.PI * 2);
    ctx.stroke();

    // Red bands at both extremes of the boost sweep on themed faces.
    if (theme.markers !== "numbers") {
      ctx.strokeStyle = theme.redlineColor;
      ctx.lineWidth = radius * 0.08;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.82, startAngle, startAngle + sweep * 0.12);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.82, startAngle + sweep * 0.88, startAngle + sweep);
      ctx.stroke();
    }

    for (let mark = 0; mark <= 6; mark++) {
      const angle = startAngle + (mark / 6) * sweep;
      if (theme.markers === "dots") {
        ctx.fillStyle = theme.markerColor;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(angle) * radius * 0.79, cy + Math.sin(angle) * radius * 0.79, radius * 0.07, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      if (theme.markers === "chevrons") {
        this.drawChevron(ctx, cx + Math.cos(angle) * radius * 0.8, cy + Math.sin(angle) * radius * 0.8, radius * 0.1, angle, theme.markerColor);
        continue;
      }
      ctx.strokeStyle = theme.markerColor;
      ctx.lineWidth = radius * 0.035;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * radius * 0.72, cy + Math.sin(angle) * radius * 0.72);
      ctx.lineTo(cx + Math.cos(angle) * radius * 0.86, cy + Math.sin(angle) * radius * 0.86);
      ctx.stroke();
    }

    if (theme.markers === "numbers") {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `bold ${Math.floor(radius * 0.24)}px 'Chakra Petch', sans-serif`;
      ctx.fillStyle = "#ffffff";
      ctx.fillText("30", cx + radius * 0.42, cy - radius * 0.42);
      ctx.fillStyle = theme.redlineColor;
      ctx.fillText("-30", cx - radius * 0.1, cy + radius * 0.55);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillText("0", cx - radius * 0.55, cy - radius * 0.28);
    }

    // Needle: -1..1 boost maps across the sweep, resting at the center mark.
    const fraction = clamp01(this.smoothedBoost * 0.5 + 0.5);
    this.drawNeedle(ctx, cx, cy, radius * 0.8, startAngle + sweep * fraction);
  }

  /** Paw print filling the boost gauge — the bunny theme's little joke. */
  private drawPaw(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.94, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "rgba(196,200,208,0.8)";
    this.drawEllipse(ctx, cx, cy + radius * 0.28, radius * 0.4, radius * 0.32, 0);
    const toes: ReadonlyArray<[number, number]> = [
      [-0.48, -0.1],
      [-0.18, -0.38],
      [0.2, -0.38],
      [0.48, -0.1],
    ];
    for (const [tx, ty] of toes) {
      this.drawEllipse(ctx, cx + tx * radius, cy + ty * radius, radius * 0.16, radius * 0.2, tx * 0.6);
    }
    ctx.restore();
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
