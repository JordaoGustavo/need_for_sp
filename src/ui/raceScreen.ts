import { BANDEIRANTITA } from "../content/tracks/bandeirantita";
import { getCarById } from "../content/cars";
import type { CarDefinition } from "../domain/car";
import { KeyboardInputController } from "../game/inputController";
import { RaceSession } from "../game/raceSession";
import { CanvasRaceRenderer } from "../rendering/canvasRenderer";
import { DefaultDigitalHudSkin } from "../rendering/hudSkins/defaultDigitalHudSkin";
import type { RenderedCar } from "../rendering/renderer";
import type { PeerConnection } from "../net/webrtcConnection";

export interface RaceScreenConfig {
  readonly localCar: CarDefinition;
  readonly remoteCarFallback: CarDefinition;
  readonly localPlayerId: string;
  readonly remotePlayerId: string;
  readonly isHost: boolean;
  readonly peer: PeerConnection;
  readonly onExit: () => void;
}

/** Race step: renders the (currently single, drag-type) Bandeirantita track and HUD. */
export function renderRaceScreen(config: RaceScreenConfig): HTMLElement {
  const root = document.createElement("div");
  root.className = "screen race-screen";

  const canvas = document.createElement("canvas");
  root.appendChild(canvas);

  const exitButton = document.createElement("button");
  exitButton.className = "race-exit-button hidden";
  exitButton.textContent = "Voltar ao menu";
  exitButton.addEventListener("click", config.onExit);
  root.appendChild(exitButton);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  const renderer = new CanvasRaceRenderer(ctx);
  const hudSkin = new DefaultDigitalHudSkin();
  const input = new KeyboardInputController();

  const session = new RaceSession({
    track: BANDEIRANTITA,
    localCar: config.localCar,
    localPlayerId: config.localPlayerId,
    remotePlayerId: config.remotePlayerId,
    isHost: config.isHost,
    peer: config.peer,
  });

  function resize(): void {
    canvas.width = root.clientWidth || window.innerWidth;
    canvas.height = root.clientHeight || window.innerHeight;
    renderer.resize(canvas.width, canvas.height);
  }
  window.addEventListener("resize", resize);
  resize();

  session.start();

  let lastTimestampMs: number | null = null;
  let animationFrameId = 0;
  let disposed = false;

  function frame(timestampMs: number): void {
    if (disposed) return;
    const dtSeconds = lastTimestampMs === null ? 0 : Math.min(0.1, (timestampMs - lastTimestampMs) / 1000);
    lastTimestampMs = timestampMs;

    const snapshot = session.update(dtSeconds, input.read());
    const remoteCarDef = resolveRemoteCarDefinition(session, config.remoteCarFallback);

    const cars: RenderedCar[] = [
      { definition: config.localCar, state: snapshot.localState, isLocalPlayer: true },
      { definition: remoteCarDef, state: snapshot.remoteState, isLocalPlayer: false },
    ];

    renderer.renderFrame({
      track: BANDEIRANTITA,
      cars,
      localPlayerHud: snapshot.localHud,
      hudSkin,
      countdownSecondsRemaining: snapshot.countdownSecondsRemaining,
      raceMessage: snapshot.message,
    });

    exitButton.classList.toggle("hidden", !snapshot.finished);

    animationFrameId = requestAnimationFrame(frame);
  }
  animationFrameId = requestAnimationFrame(frame);

  const cleanup = (): void => {
    disposed = true;
    cancelAnimationFrame(animationFrameId);
    window.removeEventListener("resize", resize);
    input.dispose();
  };
  root.addEventListener("screen-teardown", cleanup, { once: true });

  return root;
}

/**
 * The remote player's real CarDefinition is only known once their 'hello' message
 * arrives (see RaceSession.getRemoteCarId). Until then, render them as the fallback
 * (the local player's own car) rather than leaving them undrawn.
 */
function resolveRemoteCarDefinition(session: RaceSession, fallback: CarDefinition): CarDefinition {
  return getCarById(session.getRemoteCarId() ?? "") ?? fallback;
}
