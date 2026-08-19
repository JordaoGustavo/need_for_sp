import type { CarDefinition } from "../../domain/car";
import type { YoutuberProfile } from "../../domain/youtuber";
import { playBack, playConfirm, playHover, playSelect } from "../../audio/uiSounds";
import { createCarPreview } from "./carPreview";
import { attachMenuKeyboard, buildPillButton } from "./nfsuMenuChrome";

export type RaceMode = "solo" | "multiplayer";

/**
 * Car select modeled on NFSU2's "Customize Car Select" screen: green title
 * top-left, thin progress strip, a translucent selector panel with ◄ ► arrows,
 * the car badge in a green-bordered box, the model name ghosted large on the
 * right, the 3D car on the turntable below, horizontal stat bars along the
 * bottom, and the mode/back pills bottom-right (Corrida Solo / Multiplayer —
 * or a single Continuar when joining someone's room via invite link).
 */
export function renderCarSelectScreen(
  youtuber: YoutuberProfile,
  onSelect: (car: CarDefinition, mode: RaceMode) => void,
  onBack: () => void,
  isGuestJoin: boolean,
  onCustomizeGauges: () => void,
): HTMLElement {
  const root = document.createElement("div");
  root.className = "screen ccs";
  root.style.setProperty("--theme-color", youtuber.themeColor);

  const cars = youtuber.garage.cars;
  const firstCar = cars[0];
  if (!firstCar) throw new Error(`Garage of ${youtuber.id} has no cars`);
  let index = 0;
  let selected: CarDefinition = firstCar;

  // --- header: title + garage label ------------------------------------------
  const header = document.createElement("div");
  header.className = "ccs-header";

  const title = document.createElement("h1");
  title.className = "ccs-title";
  title.textContent = "Seleção de Carro";

  const category = document.createElement("div");
  category.className = "ccs-category";
  category.textContent = youtuber.displayName;

  header.append(title, category);

  // --- thin progress strip -----------------------------------------------------
  const progress = document.createElement("div");
  progress.className = "ccs-progress";
  const progressDot = document.createElement("div");
  progressDot.className = "ccs-progress-dot";
  progress.appendChild(progressDot);

  // --- selector panel: ◄ [badge] ghost-name ► ---------------------------------
  const panel = document.createElement("div");
  panel.className = "ccs-panel";

  const prevArrow = buildPanelArrow("◄", () => cycle(-1));
  const nextArrow = buildPanelArrow("►", () => cycle(1));

  const badge = document.createElement("div");
  badge.className = "ccs-badge";
  const badgeSwatch = document.createElement("div");
  badgeSwatch.className = "ccs-badge-swatch";
  const badgeName = document.createElement("div");
  badgeName.className = "ccs-badge-name";
  badge.append(badgeSwatch, badgeName);

  const ghost = document.createElement("div");
  ghost.className = "ccs-ghost";

  panel.append(prevArrow, badge, ghost, nextArrow);

  // --- 3D showcase ---------------------------------------------------------------
  const preview = createCarPreview(selected);

  // --- bottom: stats + player + pills ---------------------------------------------
  const stats = document.createElement("div");
  stats.className = "ccs-stats";

  const player = document.createElement("div");
  player.className = "ccs-player";
  player.textContent = youtuber.channelHandle;

  const pills = document.createElement("div");
  pills.className = "nfsu-pill-stack";
  const confirm = (mode: RaceMode) => (): void => {
    playConfirm();
    onSelect(selected, mode);
  };
  const back = (): void => {
    playBack();
    onBack();
  };
  const customizeGauges = (): void => {
    playSelect();
    onCustomizeGauges();
  };
  // Enter confirms the primary action: joining the invited room as guest, or solo.
  const primaryConfirm = isGuestJoin ? confirm("multiplayer") : confirm("solo");
  if (isGuestJoin) {
    pills.append(
      buildPillButton("Velocímetro", customizeGauges),
      buildPillButton("Voltar", back),
      buildPillButton("Continuar", confirm("multiplayer")),
    );
  } else {
    pills.append(
      buildPillButton("Corrida Solo", confirm("solo")),
      buildPillButton("Multiplayer", confirm("multiplayer")),
      buildPillButton("Velocímetro", customizeGauges),
      buildPillButton("Voltar", back),
    );
  }

  root.append(header, progress, panel, preview.element, stats, player, pills);

  function cycle(step: number): void {
    playSelect();
    setIndex(index + step);
  }

  function setIndex(nextIndex: number): void {
    index = (nextIndex + cars.length) % cars.length;
    selected = cars[index] ?? selected;

    badgeSwatch.style.background = selected.visual.color;
    badgeName.textContent = selected.visual.displayName;
    ghost.textContent = selected.visual.displayName;
    preview.setCar(selected);

    const fraction = cars.length <= 1 ? 0.5 : index / (cars.length - 1);
    progressDot.style.left = `${fraction * 100}%`;

    renderStats(stats, selected);
  }
  setIndex(0);

  const detachKeyboard = attachMenuKeyboard({
    onLeft: () => cycle(-1),
    onRight: () => cycle(1),
    onConfirm: primaryConfirm,
    onBack: back,
  });

  root.addEventListener(
    "screen-teardown",
    () => {
      detachKeyboard();
      preview.dispose();
    },
    { once: true },
  );

  return root;
}

function buildPanelArrow(label: string, onClick: () => void): HTMLButtonElement {
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

function renderStats(container: HTMLElement, car: CarDefinition): void {
  container.replaceChildren(
    buildStat("ACELERAÇÃO", car.stats.accelerationKmhPerSec, 40),
    buildStat("VELOCIDADE", car.stats.topSpeedKmh, 260),
    buildStat("MANOBRA", car.stats.turnRateRadPerSec, 4),
  );
}

function buildStat(label: string, value: number, referenceMax: number): HTMLElement {
  const stat = document.createElement("div");
  stat.className = "ccs-stat";

  const labelEl = document.createElement("div");
  labelEl.className = "ccs-stat-label";
  labelEl.textContent = label;

  const track = document.createElement("div");
  track.className = "ccs-stat-track";
  const fill = document.createElement("div");
  fill.className = "ccs-stat-fill";
  const fraction = Math.min(100, (value / referenceMax) * 100);
  fill.style.width = `${fraction}%`;
  const dot = document.createElement("div");
  dot.className = "ccs-stat-dot";
  dot.style.left = `${fraction}%`;
  track.append(fill, dot);

  stat.append(labelEl, track);
  return stat;
}
