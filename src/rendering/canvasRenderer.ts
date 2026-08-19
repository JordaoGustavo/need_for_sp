import type { RaceRenderInput, RaceRenderer, RenderedCar } from "./renderer";

const METERS_TO_PIXELS = 6;
const HUD_HEIGHT_FRACTION = 0.22;

/**
 * MVP implementation of RaceRenderer: 2D top-down Canvas (ADR 0001), currently drawing
 * a straight (drag-style) track. Circuit tracks will need a curved-path variant behind
 * the same RaceRenderer interface — this class does not need to change for that.
 */
export class CanvasRaceRenderer implements RaceRenderer {
  private width = 0;
  private height = 0;

  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  renderFrame(input: RaceRenderInput): void {
    const { ctx, width, height } = this;
    ctx.clearRect(0, 0, width, height);

    this.drawBackground();
    this.drawTrack(input);

    const localCar = input.cars.find((car) => car.isLocalPlayer) ?? input.cars[0];
    const cameraDistanceMeters = localCar?.state.distanceMeters ?? 0;

    for (const car of input.cars) {
      this.drawCar(car, cameraDistanceMeters);
    }

    this.drawFinishLine(input, cameraDistanceMeters);

    const hudHeight = height * HUD_HEIGHT_FRACTION;
    input.hudSkin.render(ctx, input.localPlayerHud, {
      x: 0,
      y: height - hudHeight,
      width,
      height: hudHeight,
    });

    if (input.countdownSecondsRemaining !== null) {
      this.drawCountdown(input.countdownSecondsRemaining);
    }

    if (input.raceMessage) {
      this.drawMessage(input.raceMessage);
    }
  }

  private drawBackground(): void {
    const { ctx, width, height } = this;
    ctx.fillStyle = "#1b2431";
    ctx.fillRect(0, 0, width, height);
  }

  private drawTrack(input: RaceRenderInput): void {
    const { ctx, width } = this;
    const trackWidthPx = input.track.widthMeters * METERS_TO_PIXELS;
    const centerX = width / 2;

    ctx.fillStyle = "#33404f";
    ctx.fillRect(centerX - trackWidthPx / 2, 0, trackWidthPx, this.height);

    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.setLineDash([18, 18]);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, this.height);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawCar(car: RenderedCar, cameraDistanceMeters: number): void {
    const { ctx, width, height } = this;
    const centerX = width / 2 + car.state.lateralOffsetMeters * METERS_TO_PIXELS;
    const relativeDistance = car.state.distanceMeters - cameraDistanceMeters;
    const y = height * 0.7 - relativeDistance * METERS_TO_PIXELS;

    const carWidthPx = 22;
    const carHeightPx = 40;

    ctx.save();
    ctx.translate(centerX, y);
    ctx.rotate(car.state.headingRad);
    ctx.fillStyle = car.definition.visual.color;
    ctx.fillRect(-carWidthPx / 2, -carHeightPx / 2, carWidthPx, carHeightPx);
    ctx.strokeStyle = car.isLocalPlayer ? "#ffffff" : "rgba(255,255,255,0.4)";
    ctx.lineWidth = 2;
    ctx.strokeRect(-carWidthPx / 2, -carHeightPx / 2, carWidthPx, carHeightPx);
    ctx.restore();
  }

  private drawFinishLine(input: RaceRenderInput, cameraDistanceMeters: number): void {
    const { ctx, width, height } = this;
    const relativeDistance = input.track.lengthMeters - cameraDistanceMeters;
    const y = height * 0.7 - relativeDistance * METERS_TO_PIXELS;
    if (y < -40 || y > height + 40) return;

    const trackWidthPx = input.track.widthMeters * METERS_TO_PIXELS;
    const centerX = width / 2;

    ctx.fillStyle = "#ffffff";
    const squares = 8;
    const squareWidth = trackWidthPx / squares;
    for (let i = 0; i < squares; i++) {
      if (i % 2 === 0) {
        ctx.fillRect(centerX - trackWidthPx / 2 + i * squareWidth, y - 6, squareWidth, 12);
      }
    }
  }

  private drawCountdown(secondsRemaining: number): void {
    const { ctx, width, height } = this;
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 96px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label = secondsRemaining > 0 ? String(Math.ceil(secondsRemaining)) : "GO!";
    ctx.fillText(label, width / 2, height / 2);
    ctx.restore();
  }

  private drawMessage(message: string): void {
    const { ctx, width, height } = this;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, height * 0.4, width, height * 0.2);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 32px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(message, width / 2, height * 0.5);
    ctx.restore();
  }
}
