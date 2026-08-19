import type { HudSkin, HudState } from "../../domain/hud";
import { HUD_SKIN_OPTIONS } from "../../rendering/hudSkins/hudSkinRegistry";
import { loadHudSkinId, saveHudSkinId } from "../../game/hudSkinPreference";
import { playBack, playConfirm, playHover, playSelect } from "../../audio/uiSounds";
import { attachMenuKeyboard, buildMenuHeader, buildPillButton } from "./nfsuMenuChrome";

/**
 * "Indicadores Personalizados" — the NFSU2 accessories-shop screen for picking
 * the speedometer skin. A live canvas preview runs a fake driving demo (revs
 * sweeping, gears shifting, N2O pulsing) through the selected HudSkin, ◄ ►
 * cycles skins, Continuar saves the pick (localStorage) and returns.
 */
export function renderGaugeSelectScreen(onDone: () => void): HTMLElement {
  const root = document.createElement("div");
  root.className = "screen nfsu-menu gauge-select";

  let index = Math.max(
    0,
    HUD_SKIN_OPTIONS.findIndex((option) => option.id === loadHudSkinId()),
  );
  // Fresh instance per selection: cluster skins keep boost-estimation state.
  let skin: HudSkin = HUD_SKIN_OPTIONS[index]?.create() ?? HUD_SKIN_OPTIONS[0]!.create();

  // --- preview panel -----------------------------------------------------------
  const panel = document.createElement("div");
  panel.className = "gauge-preview-panel";

  const canvas = document.createElement("canvas");
  canvas.className = "gauge-preview-canvas";
  canvas.width = 760;
  canvas.height = 380;

  const prevArrow = buildArrow("◄", () => cycle(-1));
  const nextArrow = buildArrow("►", () => cycle(1));
  panel.append(prevArrow, canvas, nextArrow);

  const caption = document.createElement("div");
  caption.className = "gauge-preview-caption";

  const pills = document.createElement("div");
  pills.className = "nfsu-pill-stack";
  const confirm = (): void => {
    const option = HUD_SKIN_OPTIONS[index];
    if (option) saveHudSkinId(option.id);
    playConfirm();
    onDone();
  };
  const back = (): void => {
    playBack();
    onDone();
  };
  pills.append(buildPillButton("Continuar", confirm), buildPillButton("Voltar", back));

  root.append(buildMenuHeader("Indicadores Personalizados"), panel, caption, pills);

  function cycle(step: number): void {
    playSelect();
    index = (index + step + HUD_SKIN_OPTIONS.length) % HUD_SKIN_OPTIONS.length;
    skin = HUD_SKIN_OPTIONS[index]?.create() ?? skin;
    updateCaption();
  }

  function updateCaption(): void {
    caption.textContent = HUD_SKIN_OPTIONS[index]?.displayName ?? "";
  }
  updateCaption();

  // --- animated demo loop --------------------------------------------------------
  const ctx = canvas.getContext("2d");
  let animationFrameId = 0;
  let disposed = false;

  function frame(timestampMs: number): void {
    if (disposed || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawRoadBackdrop(ctx, canvas.width, canvas.height);
    skin.render(ctx, demoHudState(timestampMs / 1000), {
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height,
    });
    animationFrameId = requestAnimationFrame(frame);
  }
  animationFrameId = requestAnimationFrame(frame);

  const detachKeyboard = attachMenuKeyboard({
    onLeft: () => cycle(-1),
    onRight: () => cycle(1),
    onConfirm: confirm,
    onBack: back,
  });

  root.addEventListener(
    "screen-teardown",
    () => {
      disposed = true;
      cancelAnimationFrame(animationFrameId);
      detachKeyboard();
    },
    { once: true },
  );

  return root;
}

/**
 * Fake driving loop for the preview: the needle climbs through each gear, drops
 * on the shift, and a nitro shot fires once per cycle so the N2O arc reacts.
 */
function demoHudState(timeSeconds: number): HudState {
  const maxRpm = 8000;
  const redlineRpm = 7000;
  const cycleSeconds = 9;
  const t = timeSeconds % cycleSeconds;

  const gear = Math.min(6, 1 + Math.floor(t / 1.5));
  const gearProgress = (t % 1.5) / 1.5;
  const rpm = 2200 + (redlineRpm - 2200) * easeOut(gearProgress);

  const speedKmh = Math.min(255, (t / cycleSeconds) * 285);

  const nitroActive = t > 5.5 && t < 7.5;
  const nitroRemaining = nitroActive ? 1 - (t - 5.5) / 4 : t >= 7.5 ? 0.5 : 1;
  const nitroHeat = nitroActive ? (t - 5.5) / 2.5 : 0;

  return { speedKmh, rpm, maxRpm, redlineRpm, gear, nitroRemaining, nitroHeat, nitroActive };
}

function easeOut(x: number): number {
  return 1 - (1 - x) * (1 - x);
}

/** Night-road gradient with lane stripes, echoing the NFSU2 shop preview. */
function drawRoadBackdrop(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#141a24");
  sky.addColorStop(0.45, "#1c2330");
  sky.addColorStop(0.46, "#23272c");
  sky.addColorStop(1, "#0d0f12");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  // Converging lane stripes.
  ctx.strokeStyle = "rgba(220,190,60,0.5)";
  ctx.lineWidth = 4;
  const horizonY = height * 0.45;
  for (const laneX of [0.35, 0.65]) {
    ctx.beginPath();
    ctx.moveTo(width * 0.5 + (laneX - 0.5) * width * 0.12, horizonY);
    ctx.lineTo(width * laneX, height);
    ctx.stroke();
  }
}

function buildArrow(label: string, onClick: () => void): HTMLButtonElement {
  const arrow = document.createElement("button");
  arrow.className = "ccs-panel-arrow";
  arrow.textContent = label;
  arrow.addEventListener("mouseenter", playHover);
  arrow.addEventListener("click", () => {
    arrow.blur();
    onClick();
  });
  return arrow;
}
