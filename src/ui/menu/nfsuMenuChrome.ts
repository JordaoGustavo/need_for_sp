import { playHover, playSelect } from "../../audio/uiSounds";

/**
 * Shared building blocks for the NFSU2-style menu: logo (top-left), screen
 * label (top-right), the horizontal item bar with a highlighted tile and a
 * caption underneath, and the small pill buttons stacked bottom-right.
 */

export function buildLogo(): HTMLElement {
  const logo = document.createElement("div");
  logo.className = "game-logo";
  const need = document.createElement("span");
  need.className = "game-logo-need";
  need.textContent = "NEED FOR";
  const sp = document.createElement("span");
  sp.className = "game-logo-sp";
  sp.textContent = "SP";
  logo.append(need, sp);
  return logo;
}

export function buildMenuHeader(screenLabel: string): HTMLElement {
  const header = document.createElement("div");
  header.className = "nfsu-header";
  const label = document.createElement("div");
  label.className = "nfsu-screen-label";
  label.textContent = screenLabel;
  header.append(buildLogo(), label);
  return header;
}

export function buildPillButton(text: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "nfsu-pill";
  button.textContent = text;
  button.addEventListener("mouseenter", playHover);
  button.addEventListener("click", () => {
    // Blur so a focused pill doesn't also trigger via the global Enter handler.
    button.blur();
    onClick();
  });
  return button;
}

export interface CarouselItem {
  readonly id: string;
  /** Content placed inside the tile (avatar, car swatch...). */
  readonly icon: HTMLElement;
  readonly label: string;
}

export interface CarouselBar {
  readonly element: HTMLElement;
  select(index: number): void;
  selectedIndex(): number;
}

/**
 * The NFSU2 main-menu bar: a translucent horizontal strip of tiles, the
 * selected one highlighted white, with the item's name captioned below.
 * Selection fires `onChange`; confirming is the screen's concern (pill button
 * or Enter key).
 */
export function buildCarouselBar(
  items: readonly CarouselItem[],
  onChange: (index: number) => void,
): CarouselBar {
  const element = document.createElement("div");
  element.className = "nfsu-bar-wrap";

  const bar = document.createElement("div");
  bar.className = "nfsu-bar";

  const caption = document.createElement("div");
  caption.className = "nfsu-bar-caption";

  let selected = 0;
  const tiles: HTMLButtonElement[] = [];

  items.forEach((item, index) => {
    const tile = document.createElement("button");
    tile.className = "nfsu-tile";
    tile.appendChild(item.icon);
    tile.addEventListener("mouseenter", playHover);
    tile.addEventListener("click", () => {
      tile.blur();
      playSelect();
      select(index);
    });
    tiles.push(tile);
    bar.appendChild(tile);
  });

  const arrow = document.createElement("span");
  arrow.className = "nfsu-bar-arrow";
  arrow.textContent = "→";
  bar.appendChild(arrow);

  function select(index: number): void {
    selected = (index + items.length) % items.length;
    tiles.forEach((tile, i) => tile.classList.toggle("selected", i === selected));
    caption.textContent = items[selected]?.label ?? "";
    onChange(selected);
  }

  element.append(bar, caption);
  select(0);

  return {
    element,
    select,
    selectedIndex: () => selected,
  };
}

/**
 * NFSU2 menus are keyboard-first: ←/→ walk the bar, Enter confirms, Escape
 * goes back. Returns a dispose function; screens call it on teardown.
 */
export function attachMenuKeyboard(handlers: {
  onLeft(): void;
  onRight(): void;
  onConfirm(): void;
  onBack?(): void;
}): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    switch (event.key) {
      case "ArrowLeft":
        handlers.onLeft();
        break;
      case "ArrowRight":
        handlers.onRight();
        break;
      case "Enter":
        handlers.onConfirm();
        break;
      case "Escape":
        handlers.onBack?.();
        break;
    }
  };
  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}
