import type { CarDefinition } from "../../domain/car";
import type { YoutuberProfile } from "../../domain/youtuber";

/** Menu step 2 (NFSU2-style): pick a car from the selected garage. */
export function renderCarSelectScreen(
  youtuber: YoutuberProfile,
  onSelect: (car: CarDefinition) => void,
  onBack: () => void,
): HTMLElement {
  const root = document.createElement("div");
  root.className = "screen car-select";
  root.style.setProperty("--theme-color", youtuber.themeColor);

  const back = document.createElement("button");
  back.className = "back-button";
  back.textContent = "< Trocar garagem";
  back.addEventListener("click", onBack);

  const title = document.createElement("h1");
  title.className = "screen-title";
  title.textContent = `Garagem de ${youtuber.displayName}`;

  const subtitle = document.createElement("p");
  subtitle.className = "screen-subtitle";
  subtitle.textContent = "Escolha seu carro para a corrida.";

  const grid = document.createElement("div");
  grid.className = "car-grid";

  for (const car of youtuber.garage.cars) {
    grid.appendChild(buildCarCard(car, () => onSelect(car)));
  }

  root.append(back, title, subtitle, grid);
  return root;
}

function buildCarCard(car: CarDefinition, onSelect: () => void): HTMLElement {
  const card = document.createElement("button");
  card.className = "car-card";

  const swatch = document.createElement("div");
  swatch.className = "car-card-swatch";
  swatch.style.background = car.visual.color;

  const name = document.createElement("div");
  name.className = "car-card-name";
  name.textContent = car.visual.displayName;

  const stats = document.createElement("div");
  stats.className = "car-card-stats";
  stats.append(
    buildStatBar("Velocidade", car.stats.topSpeedKmh, 260),
    buildStatBar("Aceleração", car.stats.accelerationKmhPerSec, 100),
    buildStatBar("Manobrabilidade", car.stats.turnRateRadPerSec, 4),
  );

  card.append(swatch, name, stats);
  card.addEventListener("click", onSelect);
  return card;
}

function buildStatBar(label: string, value: number, referenceMax: number): HTMLElement {
  const row = document.createElement("div");
  row.className = "stat-row";

  const labelEl = document.createElement("span");
  labelEl.className = "stat-label";
  labelEl.textContent = label;

  const track = document.createElement("div");
  track.className = "stat-track";
  const fill = document.createElement("div");
  fill.className = "stat-fill";
  fill.style.width = `${Math.min(100, (value / referenceMax) * 100)}%`;
  track.appendChild(fill);

  row.append(labelEl, track);
  return row;
}
