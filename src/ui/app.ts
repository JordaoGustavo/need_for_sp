import type { CarDefinition } from "../domain/car";
import type { YoutuberProfile } from "../domain/youtuber";
import { renderYoutuberSelectScreen } from "./menu/youtuberSelectScreen";
import { renderCarSelectScreen } from "./menu/carSelectScreen";
import { renderRoomScreen, type RoomScreenResult } from "./roomScreen";
import { renderRaceScreen } from "./raceScreen";

/**
 * Top-level screen state machine: Youtuber -> Carro -> Sala -> Corrida -> (volta ao início).
 * Each screen is a self-contained render function; app.ts only wires transitions.
 */
export function startApp(container: HTMLElement): void {
  showScreen(container, renderYoutuberSelectScreen(onYoutuberSelected));

  function onYoutuberSelected(youtuber: YoutuberProfile): void {
    showScreen(
      container,
      renderCarSelectScreen(
        youtuber,
        (car) => onCarSelected(youtuber, car),
        () => showScreen(container, renderYoutuberSelectScreen(onYoutuberSelected)),
      ),
    );
  }

  function onCarSelected(youtuber: YoutuberProfile, car: CarDefinition): void {
    showScreen(
      container,
      renderRoomScreen(
        youtuber,
        car,
        (room) => onRoomReady(car, room),
        () => onYoutuberSelected(youtuber),
      ),
    );
  }

  function onRoomReady(car: CarDefinition, room: RoomScreenResult): void {
    const localPlayerId = room.isHost ? "host" : "guest";
    const remotePlayerId = room.isHost ? "guest" : "host";

    showScreen(
      container,
      renderRaceScreen({
        localCar: car,
        remoteCarFallback: car,
        localPlayerId,
        remotePlayerId,
        isHost: room.isHost,
        peer: room.peer,
        onExit: () => {
          // Fresh page load resets room/peer state cleanly for the next race.
          window.location.href = window.location.origin + window.location.pathname;
        },
      }),
    );
  }
}

function showScreen(container: HTMLElement, screen: HTMLElement): void {
  const previous = Array.from(container.children);
  container.appendChild(screen);
  for (const child of previous) {
    child.dispatchEvent(new Event("screen-teardown"));
    child.remove();
  }
}
