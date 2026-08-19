import type { TrackDefinition } from "../../domain/track";
import { TRACKS } from "../../content/tracks";
import { createTrackPathModel } from "../../rendering/three/trackPath";
import type { TimeOfDay } from "../../rendering/renderer";
import { playBack, playConfirm, playHover, playSelect } from "../../audio/uiSounds";
import { attachMenuKeyboard, buildMenuHeader, buildPillButton } from "./nfsuMenuChrome";

/**
 * Track select, NFSU2-style: one card per track from the content registry,
 * each with its outline drawn from the same path model the renderer uses,
 * plus type/length/laps and a day/night period toggle. ◄ ► keyboard
 * navigation, Enter confirms.
 */
export function renderTrackSelectScreen(
  onSelect: (track: TrackDefinition, timeOfDay: TimeOfDay) => void,
  onBack: () => void,
): HTMLElement {
  const root = document.createElement("div");
  root.className = "screen nfsu-menu";

  const firstTrack = TRACKS[0];
  if (!firstTrack) throw new Error("No tracks registered");
  let selected: TrackDefinition = firstTrack;
  let index = 0;

  const grid = document.createElement("div");
  grid.className = "track-grid";

  const cards: HTMLButtonElement[] = [];
  TRACKS.forEach((track, i) => {
    const card = buildTrackCard(track);
    card.addEventListener("mouseenter", playHover);
    card.addEventListener("click", () => {
      card.blur();
      playSelect();
      select(i);
    });
    cards.push(card);
    grid.appendChild(card);
  });

  function select(nextIndex: number): void {
    index = (nextIndex + TRACKS.length) % TRACKS.length;
    selected = TRACKS[index] ?? selected;
    cards.forEach((card, i) => card.classList.toggle("selected", i === index));
  }
  select(0);

  // Day/night period toggle.
  let timeOfDay: TimeOfDay = "night";
  const periodRow = document.createElement("div");
  periodRow.className = "period-toggle";
  const periodLabel = document.createElement("span");
  periodLabel.className = "period-toggle-label";
  periodLabel.textContent = "Período:";
  const nightButton = document.createElement("button");
  nightButton.className = "period-option selected";
  nightButton.textContent = "🌙 Noite";
  const dayButton = document.createElement("button");
  dayButton.className = "period-option";
  dayButton.textContent = "☀️ Dia";
  const setPeriod = (period: TimeOfDay): void => {
    timeOfDay = period;
    nightButton.classList.toggle("selected", period === "night");
    dayButton.classList.toggle("selected", period === "day");
  };
  nightButton.addEventListener("click", () => {
    playSelect();
    setPeriod("night");
  });
  dayButton.addEventListener("click", () => {
    playSelect();
    setPeriod("day");
  });
  periodRow.append(periodLabel, nightButton, dayButton);

  const pills = document.createElement("div");
  pills.className = "nfsu-pill-stack";
  const confirm = (): void => {
    playConfirm();
    onSelect(selected, timeOfDay);
  };
  const back = (): void => {
    playBack();
    onBack();
  };
  pills.append(buildPillButton("Continuar", confirm), buildPillButton("Voltar", back));

  root.append(buildMenuHeader("Seleção de Pista"), grid, periodRow, pills);

  const detachKeyboard = attachMenuKeyboard({
    onLeft: () => {
      playSelect();
      select(index - 1);
    },
    onRight: () => {
      playSelect();
      select(index + 1);
    },
    onConfirm: confirm,
    onBack: back,
  });
  root.addEventListener("screen-teardown", () => detachKeyboard(), { once: true });

  return root;
}

function buildTrackCard(track: TrackDefinition): HTMLButtonElement {
  const card = document.createElement("button");
  card.className = "track-card";

  const canvas = document.createElement("canvas");
  canvas.className = "track-card-canvas";
  canvas.width = 240;
  canvas.height = 140;
  drawTrackOutline(canvas, track);

  const name = document.createElement("div");
  name.className = "track-card-name";
  name.textContent = track.displayName;

  const meta = document.createElement("div");
  meta.className = "track-card-meta";
  const km = (track.lengthMeters / 1000).toFixed(1).replace(".", ",");
  meta.textContent =
    track.raceType === "drag"
      ? `ARRANCADA · ${track.lengthMeters}m`
      : `CIRCUITO · ${track.laps} VOLTAS · ${km}km`;

  const description = document.createElement("div");
  description.className = "track-card-description";
  description.textContent = track.description;

  card.append(canvas, name, meta, description);
  return card;
}

/** Draws the track outline using the same path model the 3D renderer uses. */
function drawTrackOutline(canvas: HTMLCanvasElement, track: TrackDefinition): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const samples = createTrackPathModel(track).sample(track.lengthMeters / 90, 0, track.lengthMeters);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const s of samples) {
    minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
    minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z);
  }
  const pad = 18;
  const scale = Math.min(
    (canvas.width - pad * 2) / Math.max(1, maxX - minX),
    (canvas.height - pad * 2) / Math.max(1, maxZ - minZ),
  );
  const midX = (minX + maxX) / 2;
  const midZ = (minZ + maxZ) / 2;

  ctx.strokeStyle = "#b8ff1f";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(184,255,31,0.5)";
  ctx.shadowBlur = 8;
  ctx.beginPath();
  samples.forEach((s, i) => {
    const x = canvas.width / 2 + (s.x - midX) * scale;
    const y = canvas.height / 2 + (s.z - midZ) * scale;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}
