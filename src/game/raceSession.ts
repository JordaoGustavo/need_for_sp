import { DEFAULT_ENGINE_PROFILE, createInitialCarRuntimeState, type CarDefinition, type CarInput, type CarRuntimeState } from "../domain/car";
import { deriveHudState } from "./hudDerivation";
import type { HudState } from "../domain/hud";
import { createRaceRules, type RaceRules } from "../domain/raceRules";
import { createInitialRaceProgress, type RaceProgress, type TrackDefinition } from "../domain/track";
import { stepCarPhysics } from "../physics/carPhysics";
import type { PeerConnection } from "../net/webrtcConnection";
import { decodeRaceMessage, encodeRaceMessage, type RaceMessage } from "../net/raceProtocol";

const COUNTDOWN_SECONDS = 3;
const REMOTE_STATE_SEND_INTERVAL_SECONDS = 1 / 20;

export interface RaceSessionConfig {
  readonly track: TrackDefinition;
  readonly localCar: CarDefinition;
  readonly localPlayerId: string;
  readonly remotePlayerId: string;
  readonly isHost: boolean;
  readonly peer: PeerConnection;
  readonly now?: () => number;
}

export interface RaceSessionSnapshot {
  readonly localState: CarRuntimeState;
  readonly remoteState: CarRuntimeState;
  readonly localHud: HudState;
  readonly countdownSecondsRemaining: number | null;
  readonly finished: boolean;
  readonly winnerId: string | null;
  readonly message: string | null;
}

/**
 * Orchestrates one race: local prediction for the player's own car, remote-state
 * interpolation for the peer's car, and host-authoritative arbitration of race-flow
 * events (ADR 0004). Depends only on domain (RaceRules, physics) and the PeerConnection
 * transport seam — no rendering or DOM code.
 */
export class RaceSession {
  private readonly rules: RaceRules;
  private readonly now: () => number;

  private localState: CarRuntimeState;
  private remoteState: CarRuntimeState;
  private previousRemoteSnapshot: { state: CarRuntimeState; receivedAtMs: number } | null = null;
  private latestRemoteSnapshot: { state: CarRuntimeState; receivedAtMs: number } | null = null;

  private localProgress: RaceProgress;
  private remoteProgress: RaceProgress;

  private remoteHelloReceived = false;
  private remoteCarId: string | null = null;
  private startAtEpochMs: number | null = null;
  private raceTimeSeconds = 0;
  private timeSinceLastSendSeconds = 0;

  private finished = false;
  private winnerId: string | null = null;

  constructor(private readonly config: RaceSessionConfig) {
    this.rules = createRaceRules(config.track);
    this.now = config.now ?? (() => Date.now());

    this.localState = createInitialCarRuntimeState(config.localPlayerId);
    this.remoteState = createInitialCarRuntimeState(config.remotePlayerId);
    this.localProgress = createInitialRaceProgress(config.localPlayerId);
    this.remoteProgress = createInitialRaceProgress(config.remotePlayerId);

    config.peer.onMessage((data) => this.handleMessage(decodeRaceMessage(data)));
  }

  start(): void {
    this.send({ type: "hello", carId: this.config.localCar.id });
    if (this.config.isHost) {
      this.maybeStartCountdownAsHost();
    }
  }

  /** Advances local simulation by dtSeconds using the given input. Call once per frame. */
  update(dtSeconds: number, input: CarInput): RaceSessionSnapshot {
    const countdownRemaining = this.countdownSecondsRemaining();
    const racing = countdownRemaining !== null && countdownRemaining <= 0;

    if (racing && !this.finished) {
      this.raceTimeSeconds += dtSeconds;
      this.localState = stepCarPhysics(this.localState, this.config.localCar.stats, input, dtSeconds);
      this.localProgress = this.rules.updateProgress(
        this.localProgress,
        this.localState,
        this.config.track,
        this.raceTimeSeconds,
      );

      if (this.config.isHost) {
        this.remoteProgress = this.rules.updateProgress(
          this.remoteProgress,
          this.remoteState,
          this.config.track,
          this.raceTimeSeconds,
        );
        this.maybeDeclareWinnerAsHost();
      }

      this.timeSinceLastSendSeconds += dtSeconds;
      if (this.timeSinceLastSendSeconds >= REMOTE_STATE_SEND_INTERVAL_SECONDS) {
        this.timeSinceLastSendSeconds = 0;
        this.send({ type: "carState", state: this.localState, raceTimeSeconds: this.raceTimeSeconds });
      }
    }

    return this.snapshot(countdownRemaining, racing);
  }

  private snapshot(countdownSecondsRemaining: number | null, racing: boolean): RaceSessionSnapshot {
    const hud = deriveHudState(this.localState.speedKmh, this.config.localCar.stats, DEFAULT_ENGINE_PROFILE);

    let message: string | null = null;
    if (!this.remoteHelloReceived) {
      message = "Aguardando o outro jogador...";
    } else if (this.finished) {
      message =
        this.winnerId === this.config.localPlayerId ? "Você venceu!" : "O outro jogador venceu!";
    } else if (!racing && countdownSecondsRemaining === null) {
      message = "Aguardando início da corrida...";
    }

    return {
      localState: this.localState,
      remoteState: this.interpolatedRemoteState(),
      localHud: hud,
      countdownSecondsRemaining,
      finished: this.finished,
      winnerId: this.winnerId,
      message,
    };
  }

  private interpolatedRemoteState(): CarRuntimeState {
    const latest = this.latestRemoteSnapshot;
    const previous = this.previousRemoteSnapshot;
    if (!latest) return this.remoteState;
    if (!previous || previous.receivedAtMs === latest.receivedAtMs) return latest.state;

    const span = latest.receivedAtMs - previous.receivedAtMs;
    const elapsed = this.now() - latest.receivedAtMs;
    const factor = clamp01(elapsed / span);

    return {
      carId: latest.state.carId,
      distanceMeters: lerp(previous.state.distanceMeters, latest.state.distanceMeters, factor),
      lateralOffsetMeters: lerp(previous.state.lateralOffsetMeters, latest.state.lateralOffsetMeters, factor),
      speedKmh: lerp(previous.state.speedKmh, latest.state.speedKmh, factor),
      headingRad: lerp(previous.state.headingRad, latest.state.headingRad, factor),
    };
  }

  private countdownSecondsRemaining(): number | null {
    if (this.startAtEpochMs === null) return null;
    const remaining = (this.startAtEpochMs - this.now()) / 1000;
    return Math.max(0, remaining);
  }

  private maybeStartCountdownAsHost(): void {
    if (!this.remoteHelloReceived || this.startAtEpochMs !== null) return;
    this.startAtEpochMs = this.now() + COUNTDOWN_SECONDS * 1000;
    this.send({ type: "raceStart", startAtEpochMs: this.startAtEpochMs });
  }

  private maybeDeclareWinnerAsHost(): void {
    if (this.winnerId) return;

    const localFinished = this.localProgress.finished ? this.localProgress : null;
    const remoteFinished = this.remoteProgress.finished ? this.remoteProgress : null;

    const winner = pickEarlierFinisher(localFinished, remoteFinished);
    if (!winner) return;

    this.winnerId = winner.playerId;
    this.finished = true;
    this.send({
      type: "raceFinished",
      winnerId: winner.playerId,
      finishTimeSeconds: winner.finishTimeSeconds ?? this.raceTimeSeconds,
    });
  }

  private handleMessage(message: RaceMessage): void {
    switch (message.type) {
      case "hello":
        this.remoteHelloReceived = true;
        this.remoteCarId = message.carId;
        if (this.config.isHost) this.maybeStartCountdownAsHost();
        return;
      case "raceStart":
        this.startAtEpochMs = message.startAtEpochMs;
        return;
      case "carState":
        this.previousRemoteSnapshot = this.latestRemoteSnapshot;
        this.latestRemoteSnapshot = { state: message.state, receivedAtMs: this.now() };
        this.remoteState = message.state;
        return;
      case "raceFinished":
        this.finished = true;
        this.winnerId = message.winnerId;
        return;
    }
  }

  /** The car id the remote player picked in the menu, once their 'hello' has arrived. */
  getRemoteCarId(): string | null {
    return this.remoteCarId;
  }

  private send(message: RaceMessage): void {
    this.config.peer.send(encodeRaceMessage(message));
  }
}

function pickEarlierFinisher(a: RaceProgress | null, b: RaceProgress | null): RaceProgress | null {
  if (a && b) {
    return (a.finishTimeSeconds ?? Infinity) <= (b.finishTimeSeconds ?? Infinity) ? a : b;
  }
  return a ?? b;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
