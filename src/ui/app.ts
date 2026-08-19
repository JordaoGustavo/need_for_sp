import type { CarDefinition } from "../domain/car";
import type { TrackDefinition } from "../domain/track";
import type { YoutuberProfile } from "../domain/youtuber";
import { BANDEIRANTITA, getTrackById } from "../content/tracks";
import { renderYoutuberSelectScreen } from "./menu/youtuberSelectScreen";
import { renderCarSelectScreen, type RaceMode } from "./menu/carSelectScreen";
import { renderGaugeSelectScreen } from "./menu/gaugeSelectScreen";
import { renderTrackSelectScreen } from "./menu/trackSelectScreen";
import { renderRoomScreen, type RoomScreenResult } from "./roomScreen";
import { renderRaceScreen } from "./raceScreen";
import { ensureMenuMusic, stopMenuMusic } from "../audio/menuMusic";
import { parseRoomCodeFromUrl, parseTimeOfDayFromUrl, parseTrackIdFromUrl } from "../net/roomCode";
import type { TimeOfDay } from "../rendering/renderer";

/**
 * Top-level screen state machine:
 * Youtuber -> Carro -> Pista -> (Solo: corrida | Multiplayer: Sala -> corrida).
 * Guests joining via invite link skip track select — the host's track travels
 * in the URL (ADR 0008). Each screen is a self-contained render function;
 * app.ts only wires transitions.
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
        // Gauge shop saves to localStorage and simply returns to car select.
        () => showScreen(container, renderGaugeSelectScreen(() => onYoutuberSelected(youtuber))),
      ),
    );
  }

  function onCarSelected(youtuber: YoutuberProfile, car: CarDefinition, mode: RaceMode): void {
    const isGuestJoin = parseRoomCodeFromUrl(window.location.href) !== null;
    if (mode === "multiplayer" && isGuestJoin) {
      // Guest: the host already picked the track; it rides in the invite URL.
      const track = getTrackById(parseTrackIdFromUrl(window.location.href) ?? "") ?? BANDEIRANTITA;
      showRoomScreen(youtuber, car, track, parseTimeOfDayFromUrl(window.location.href));
      return;
    }

    showScreen(
      container,
      renderTrackSelectScreen(
        (track, timeOfDay) => onTrackSelected(youtuber, car, mode, track, timeOfDay),
        () => onYoutuberSelected(youtuber),
      ),
    );
  }

  function onTrackSelected(
    youtuber: YoutuberProfile,
    car: CarDefinition,
    mode: RaceMode,
    track: TrackDefinition,
    timeOfDay: TimeOfDay,
  ): void {
    if (mode === "solo") {
      startRace(track, timeOfDay, car, {
        localPlayerId: "solo",
        remotePlayerId: "ghost",
        isHost: true,
        peer: null,
      });
      return;
    }
    showRoomScreen(youtuber, car, track, timeOfDay);
  }

  function showRoomScreen(
    youtuber: YoutuberProfile,
    car: CarDefinition,
    track: TrackDefinition,
    timeOfDay: TimeOfDay,
  ): void {
    showScreen(
      container,
      renderRoomScreen(
        youtuber,
        car,
        track,
        timeOfDay,
        (room) => onRoomReady(car, track, timeOfDay, room),
        () => onYoutuberSelected(youtuber),
      ),
    );
  }

  function onRoomReady(
    car: CarDefinition,
    track: TrackDefinition,
    timeOfDay: TimeOfDay,
    room: RoomScreenResult,
  ): void {
    startRace(track, timeOfDay, car, {
      localPlayerId: room.isHost ? "host" : "guest",
      remotePlayerId: room.isHost ? "guest" : "host",
      isHost: room.isHost,
      peer: room.peer,
    });
  }

  function startRace(
    track: TrackDefinition,
    timeOfDay: TimeOfDay,
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
        track,
        timeOfDay,
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
