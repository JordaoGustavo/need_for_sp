import { getCarById } from "../content/cars";
import type { TrackDefinition } from "../domain/track";
import type { CarDefinition } from "../domain/car";
import { deriveHudState } from "../game/hudDerivation";
import { EngineSound } from "../audio/engineSound";
import { TireSquealSound } from "../audio/tireSquealSound";
import { LAUNCH_WHEELSPIN_MAX_KMH } from "../game/raceSession";
import { KeyboardInputController } from "../game/inputController";
import { RaceSession } from "../game/raceSession";
import { ThreeRaceRenderer } from "../rendering/three/threeRaceRenderer";
import { NfsuClusterHudSkin } from "../rendering/hudSkins/nfsuClusterHudSkin";
import type { RenderedCar } from "../rendering/renderer";
import type { PeerConnection } from "../net/webrtcConnection";

export interface RaceScreenConfig {
  readonly track: TrackDefinition;
  readonly localCar: CarDefinition;
  readonly remoteCarFallback: CarDefinition;
  readonly localPlayerId: string;
  readonly remotePlayerId: string;
  readonly isHost: boolean;
  /** null runs a solo race — no remote car, no networking. */
  readonly peer: PeerConnection | null;
  readonly onExit: () => void;
}

/** Race step: renders the configured track (drag or circuit) and HUD. */
export function renderRaceScreen(config: RaceScreenConfig): HTMLElement {
  const root = document.createElement("div");
  root.className = "screen race-screen";

  const renderer = new ThreeRaceRenderer(root);

  const localEngine = new EngineSound(config.localCar.sound);
  const tireSqueal = new TireSquealSound();
  let remoteEngine: { carId: string; sound: EngineSound } | null = null;

  const exitButton = document.createElement("button");
  exitButton.className = "race-exit-button hidden";
  exitButton.textContent = "Voltar ao menu";
  exitButton.addEventListener("click", config.onExit);
  root.appendChild(exitButton);
  const hudSkin = new NfsuClusterHudSkin();
  const input = new KeyboardInputController();

  const session = new RaceSession({
    track: config.track,
    localCar: config.localCar,
    localPlayerId: config.localPlayerId,
    remotePlayerId: config.remotePlayerId,
    isHost: config.isHost,
    peer: config.peer,
  });

  function resize(): void {
    const width = root.clientWidth || window.innerWidth;
    const height = root.clientHeight || window.innerHeight;
    renderer.resize(width, height);
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

    const carInput = input.read();
    const snapshot = session.update(dtSeconds, carInput);

    // Engine sound intensity tracks the usable rev range (idle..redline), so a
    // pegged needle means a screaming engine regardless of the dial's top number.
    if (snapshot.limiterCutTriggered) localEngine.cut();
    localEngine.update(snapshot.localHud.rpm / snapshot.localHud.redlineRpm, 1);
    tireSqueal.update(computeSquealIntensity(snapshot, carInput));

    const cars: RenderedCar[] = [
      { definition: config.localCar, state: snapshot.localState, isLocalPlayer: true },
    ];

    if (snapshot.remoteState) {
      const remoteCarDef = resolveRemoteCarDefinition(session, config.remoteCarFallback);
      if (!remoteEngine || remoteEngine.carId !== remoteCarDef.id) {
        remoteEngine?.sound.dispose();
        remoteEngine = { carId: remoteCarDef.id, sound: new EngineSound(remoteCarDef.sound) };
      }
      const remoteHud = deriveHudState(snapshot.remoteState.speedKmh, remoteCarDef.stats, remoteCarDef.engine);
      const gapMeters = Math.abs(snapshot.remoteState.distanceMeters - snapshot.localState.distanceMeters);
      remoteEngine.sound.update(remoteHud.rpm / remoteHud.redlineRpm, Math.max(0, 1 - gapMeters / 60) * 0.7);

      cars.push({ definition: remoteCarDef, state: snapshot.remoteState, isLocalPlayer: false });
    }

    renderer.renderFrame({
      track: config.track,
      cars,
      localPlayerHud: snapshot.localHud,
      hudSkin,
      countdownSecondsRemaining: snapshot.countdownSecondsRemaining,
      raceMessage: snapshot.message,
      raceTimeSeconds: snapshot.raceTimeSeconds,
      finished: snapshot.finished,
      localWon: snapshot.winnerId === null ? null : snapshot.winnerId === config.localPlayerId,
      localFinishTimeSeconds: snapshot.localFinishTimeSeconds,
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
    renderer.dispose();
    localEngine.dispose();
    tireSqueal.dispose();
    remoteEngine?.sound.dispose();
  };
  root.addEventListener("screen-teardown", cleanup, { once: true });

  return root;
}

/**
 * Tire squeal fires on launch wheelspin (full throttle at low speed once the
 * race is running) and under hard braking from speed.
 */
function computeSquealIntensity(
  snapshot: ReturnType<RaceSession["update"]>,
  carInput: ReturnType<KeyboardInputController["read"]>,
): number {
  if (snapshot.finished || snapshot.raceTimeSeconds <= 0) return 0;
  const speed = snapshot.localState.speedKmh;

  if (carInput.throttle && speed < LAUNCH_WHEELSPIN_MAX_KMH) {
    return 0.5 + 0.5 * (1 - speed / LAUNCH_WHEELSPIN_MAX_KMH);
  }
  if (carInput.brake && speed > 40) {
    return 0.6;
  }
  return 0;
}

/**
 * The remote player's real CarDefinition is only known once their 'hello' message
 * arrives (see RaceSession.getRemoteCarId). Until then, render them as the fallback
 * (the local player's own car) rather than leaving them undrawn.
 */
function resolveRemoteCarDefinition(session: RaceSession, fallback: CarDefinition): CarDefinition {
  return getCarById(session.getRemoteCarId() ?? "") ?? fallback;
}
