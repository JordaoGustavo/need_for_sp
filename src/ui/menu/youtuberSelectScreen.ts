import { YOUTUBERS } from "../../content/youtubers";
import type { YoutuberProfile } from "../../domain/youtuber";

/** Menu step 1 (NFSU2-style): pick whose garage to enter. */
export function renderYoutuberSelectScreen(onSelect: (youtuber: YoutuberProfile) => void): HTMLElement {
  const root = document.createElement("div");
  root.className = "screen youtuber-select";

  const title = document.createElement("h1");
  title.className = "screen-title";
  title.textContent = "Escolha a Garagem";

  const subtitle = document.createElement("p");
  subtitle.className = "screen-subtitle";
  subtitle.textContent = "Selecione o youtuber para ver os carros da garagem dele.";

  const grid = document.createElement("div");
  grid.className = "youtuber-grid";

  root.append(title, subtitle, grid);
  for (const youtuber of YOUTUBERS) {
    const card = document.createElement("button");
    card.className = "youtuber-card";
    card.style.setProperty("--theme-color", youtuber.themeColor);

    const avatar = document.createElement("div");
    avatar.className = "youtuber-card-avatar";
    avatar.style.background = youtuber.themeColor;
    avatar.textContent = youtuber.displayName.charAt(0);

    const name = document.createElement("div");
    name.className = "youtuber-card-name";
    name.textContent = youtuber.displayName;

    const handle = document.createElement("div");
    handle.className = "youtuber-card-handle";
    handle.textContent = youtuber.channelHandle;

    const count = document.createElement("div");
    count.className = "youtuber-card-count";
    count.textContent = `${youtuber.garage.cars.length} carros na garagem`;

    card.append(avatar, name, handle, count);
    card.addEventListener("click", () => onSelect(youtuber));
    grid.appendChild(card);
  }

  return root;
}
