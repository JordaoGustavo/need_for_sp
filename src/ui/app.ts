import type { CarDefinition } from "../domain/car";
import type { YoutuberProfile } from "../domain/youtuber";
import { renderYoutuberSelectScreen } from "./menu/youtuberSelectScreen";
import { renderCarSelectScreen, type RaceMode } from "./menu/carSelectScreen";
import { renderRoomScreen, type RoomScreenResult } from "./roomScreen";
import { renderRaceScreen } from "./raceScreen";
import { ensureMenuMusic, stopMenuMusic } from "../audio/menuMusic";
import { parseRoomCodeFromUrl } from "../net/roomCode";

/**
 * Top-level screen state machine: Youtuber -> Carro -> (Solo: corrida direto |
 * Multiplayer: Sala -> corrida) -> volta ao início. Each screen is a
 * self-contained render function; app.ts only wires transitions.
 */
export function startApp(container: HTMLElement): void {
  ensureMenuMusic();
  showScreen(container, renderYoutuberSelectScreen(onYoutuberSelected));

  function onYoutuberSelected(youtuber: YoutuberProfile): void {
    const isGuestJoin = parseRoomCodeFromUrl(window.location.href) !== null;
    showScreen(
      container,
      renderCarSelectScreen(
        youtuber,
        (car, mode) => onCarSelected(youtuber, car, mode),
        () => showScreen(container, renderYoutuberSelectScreen(onYoutuberSelected)),
        isGuestJoin,
      ),
    );
  }

  function onCarSelected(youtuber: YoutuberProfile, car: CarDefinition, mode: RaceMode): void {
    if (mode === "solo") {
      startRace(car, {
        localPlayerId: "solo",
        remotePlayerId: "ghost",
        isHost: true,
        peer: null,
      });
      return;
    }

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
    startRace(car, {
      localPlayerId: room.isHost ? "host" : "guest",
      remotePlayerId: room.isHost ? "guest" : "host",
      isHost: room.isHost,
      peer: room.peer,
    });
  }

  function startRace(
    car: CarDefinition,
    session: Pick<
      Parameters<typeof renderRaceScreen>[0],
      "localPlayerId" | "remotePlayerId" | "isHost" | "peer"
    >,
  ): void {
    stopMenuMusic();
    showScreen(
      container,
      renderRaceScreen({
        localCar: car,
        remoteCarFallback: car,
        ...session,
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
