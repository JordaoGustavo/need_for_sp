import { YOUTUBERS } from "../../content/youtubers";
import type { YoutuberProfile } from "../../domain/youtuber";
import { playConfirm, playSelect } from "../../audio/uiSounds";
import { createCarPreview } from "./carPreview";
import { attachMenuKeyboard, buildCarouselBar, buildMenuHeader, buildPillButton } from "./nfsuMenuChrome";

/**
 * Menu step 1, NFSU2 main-menu style: horizontal bar of garages (youtubers)
 * with the selected one highlighted, a showcase car from that garage rotating
 * below, and Continue pill bottom-right. ←/→ + Enter also work.
 */
export function renderYoutuberSelectScreen(onSelect: (youtuber: YoutuberProfile) => void): HTMLElement {
  const root = document.createElement("div");
  root.className = "screen nfsu-menu";

  const firstYoutuber = YOUTUBERS[0];
  if (!firstYoutuber) throw new Error("No youtubers registered");
  let selected: YoutuberProfile = firstYoutuber;

  const preview = createCarPreview(showcaseCar(selected));

  const bar = buildCarouselBar(
    YOUTUBERS.map((youtuber) => ({
      id: youtuber.id,
      icon: buildAvatar(youtuber),
      label: `${youtuber.displayName}  ·  ${youtuber.garage.cars.length} carros`,
    })),
    (index) => {
      selected = YOUTUBERS[index] ?? selected;
      root.style.setProperty("--theme-color", selected.themeColor);
      preview.setCar(showcaseCar(selected));
    },
  );

  const pills = document.createElement("div");
  pills.className = "nfsu-pill-stack";
  pills.appendChild(
    buildPillButton("Continuar", () => {
      playConfirm();
      onSelect(selected);
    }),
  );

  root.append(buildMenuHeader("Menu Principal"), bar.element, preview.element, pills);

  const detachKeyboard = attachMenuKeyboard({
    onLeft: () => {
      playSelect();
      bar.select(bar.selectedIndex() - 1);
    },
    onRight: () => {
      playSelect();
      bar.select(bar.selectedIndex() + 1);
    },
    onConfirm: () => {
      playConfirm();
      onSelect(selected);
    },
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

function showcaseCar(youtuber: YoutuberProfile) {
  const car = youtuber.garage.cars[0];
  if (!car) throw new Error(`Garage of ${youtuber.id} has no cars to showcase`);
  return car;
}

function buildAvatar(youtuber: YoutuberProfile): HTMLElement {
  const avatar = document.createElement("div");
  avatar.className = "nfsu-tile-avatar";
  avatar.style.background = youtuber.themeColor;
  avatar.textContent = youtuber.displayName.charAt(0);
  return avatar;
}
