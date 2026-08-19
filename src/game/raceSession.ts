import { NEUTRAL_INPUT, createInitialCarRuntimeState, type CarDefinition, type CarInput, type CarRuntimeState } from "../domain/car";
import { deriveHudState } from "./hudDerivation";
import type { HudState } from "../domain/hud";
import { createRaceRules, type RaceRules } from "../domain/raceRules";
import { createInitialRaceProgress, type RaceProgress, type TrackDefinition } from "../domain/track";
import { applyTrackBoundaryCollision, applyTrackLimits, resolveCarCollision, stepCarPhysics } from "../physics/carPhysics";
import type { PeerConnection } from "../net/webrtcConnection";
import { decodeRaceMessage, encodeRaceMessage, type RaceMessage } from "../net/raceProtocol";

const COUNTDOWN_SECONDS = 3;
/** How long the "GO!" flash stays on screen after the countdown hits zero. */
const GO_DISPLAY_SECONDS = 1.5;
const REMOTE_STATE_SEND_INTERVAL_SECONDS = 1 / 20;

/** Below this speed, full throttle spins the tires: revs peg high, tires squeal. */
export const LAUNCH_WHEELSPIN_MAX_KMH = 32;
/** How fast the tach needle is allowed to move, in RPM per second. */
const RPM_NEEDLE_RATE_PER_SEC = 9000;
/**
 * Ignition-cut rev limiter: hitting the redline kills spark and the revs drop
 * this much before climbing again — the needle (and exhaust) bounce at ~10Hz.
 */
const LIMITER_CUT_DROP_RPM = 850;

export interface RaceSessionConfig {
  readonly track: TrackDefinition;
  readonly localCar: CarDefinition;
  readonly localPlayerId: string;
  readonly remotePlayerId: string;
  readonly isHost: boolean;
  /** null runs the race solo: no remote car, countdown starts immediately. */
  readonly peer: PeerConnection | null;
  /**
   * Track centerline curvature at a given distance, in rad/m (0 = straight).
   * Fed into the physics so corners are NOT taken automatically — the driver
   * has to steer through them. Omit for straight strips.
   */
  readonly trackCurvature?: (distanceMeters: number) => number;
  readonly now?: () => number;
}

export interface RaceSessionSnapshot {
  readonly localState: CarRuntimeState;
  /** null in solo races — there is no other car to render. */
  readonly remoteState: CarRuntimeState | null;
  readonly localHud: HudState;
  readonly countdownSecondsRemaining: number | null;
  readonly finished: boolean;
  readonly winnerId: string | null;
  readonly message: string | null;
  readonly raceTimeSeconds: number;
  readonly localFinishTimeSeconds: number | null;
  /** true on the exact frames the rev limiter cut ignition (revving at redline). */
  readonly limiterCutTriggered: boolean;
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
  private displayedRpm: number;

  constructor(private readonly config: RaceSessionConfig) {
    this.rules = createRaceRules(config.track);
    this.now = config.now ?? (() => Date.now());
    this.displayedRpm = config.localCar.engine.idleRpm;

    // Drag-style starting lanes: host on the left half, guest on the right, so
    // the cars never begin the race overlapping (which matters now that
    // car-vs-car collision is resolved every tick). Solo starts centered.
    const laneOffsetMeters = config.peer ? config.track.widthMeters / 4 : 0;
    this.localState = {
      ...createInitialCarRuntimeState(config.localPlayerId),
      lateralOffsetMeters: config.isHost ? -laneOffsetMeters : laneOffsetMeters,
    };
    this.remoteState = {
      ...createInitialCarRuntimeState(config.remotePlayerId),
      lateralOffsetMeters: config.isHost ? laneOffsetMeters : -laneOffsetMeters,
    };
    this.localProgress = createInitialRaceProgress(config.localPlayerId);
    this.remoteProgress = createInitialRaceProgress(config.remotePlayerId);

    config.peer?.onMessage((data) => this.handleMessage(decodeRaceMessage(data)));
  }

  start(): void {
    if (!this.config.peer) {
      // Solo race: nobody to wait for — the countdown starts right away.
      this.startAtEpochMs = this.now() + COUNTDOWN_SECONDS * 1000;
      return;
    }
    this.send({ type: "hello", carId: this.config.localCar.id });
    if (this.config.isHost) {
      this.maybeStartCountdownAsHost();
    }
  }

  /** Advances local simulation by dtSeconds using the given input. Call once per frame. */
  update(dtSeconds: number, input: CarInput): RaceSessionSnapshot {
    const countdownRemaining = this.countdownSecondsRemaining();
    const racing = this.startAtEpochMs !== null && this.now() >= this.startAtEpochMs;

    if (racing && !this.finished) {
      this.raceTimeSeconds += dtSeconds;
      this.localState = stepCarPhysics(
        this.localState,
        this.config.localCar.stats,
        input,
        dtSeconds,
        this.curvatureAt(this.localState.distanceMeters),
      );
      // Car-vs-car first: its lateral push may exceed the road, so the wall clamp runs last.
      if (this.config.peer) {
        this.localState = resolveCarCollision(this.localState, this.interpolatedRemoteState());
      }
      this.localState = applyTrackBoundaryCollision(
        this.localState,
        this.config.track.widthMeters,
        dtSeconds,
        this.config.track.runoffMeters ?? 0,
      );
      if (this.config.track.raceType === "drag") {
        this.localState = applyTrackLimits(this.localState, this.config.track.lengthMeters);
      }
      this.localProgress = this.rules.updateProgress(
        this.localProgress,
        this.localState,
        this.config.track,
        this.raceTimeSeconds,
      );

      if (this.config.isHost) {
        if (this.config.peer) {
          this.remoteProgress = this.rules.updateProgress(
            this.remoteProgress,
            this.remoteState,
            this.config.track,
            this.raceTimeSeconds,
          );
        }
        // Solo: the remote never finishes, so this resolves to the local player.
        this.maybeDeclareWinnerAsHost();
      }

      this.timeSinceLastSendSeconds += dtSeconds;
      if (this.timeSinceLastSendSeconds >= REMOTE_STATE_SEND_INTERVAL_SECONDS) {
        this.timeSinceLastSendSeconds = 0;
        this.send({ type: "carState", state: this.localState, raceTimeSeconds: this.raceTimeSeconds });
      }
    } else if (this.finished) {
      // Past the line, race control takes over and threshold-brakes the car to
      // a smooth stop inside the runoff — the player never hits the end wall
      // (which remains only as a physical safety net). Engine winds down with it.
      const stillRolling = this.localState.speedKmh > 0.5;
      const raceControlStats = {
        ...this.config.localCar.stats,
        brakingKmhPerSec: this.config.localCar.stats.brakingKmhPerSec * 2.2,
      };
      this.localState = stepCarPhysics(
        this.localState,
        raceControlStats,
        stillRolling ? { throttle: false, brake: true, steer: 0 } : NEUTRAL_INPUT,
        dtSeconds,
        this.curvatureAt(this.localState.distanceMeters),
      );
      this.localState = applyTrackBoundaryCollision(
        this.localState,
        this.config.track.widthMeters,
        dtSeconds,
        this.config.track.runoffMeters ?? 0,
      );
      if (this.config.track.raceType === "drag") {
        this.localState = applyTrackLimits(this.localState, this.config.track.lengthMeters);
      }
    }

    return this.snapshot(countdownRemaining, racing, input, dtSeconds);
  }

  private snapshot(
    countdownSecondsRemaining: number | null,
    racing: boolean,
    input: CarInput,
    dtSeconds: number,
  ): RaceSessionSnapshot {
    const { hud, limiterCut } = this.deriveSmoothedHud(racing, input, dtSeconds);

    let message: string | null = null;
    if (this.config.peer && !this.remoteHelloReceived) {
      message = "Aguardando o outro jogador...";
    } else if (this.finished) {
      message =
        this.winnerId === this.config.localPlayerId ? "Você venceu!" : "O outro jogador venceu!";
    } else if (!racing && countdownSecondsRemaining === null) {
      message = "Aguardando início da corrida...";
    }

    return {
      localState: this.localState,
      remoteState: this.config.peer ? this.interpolatedRemoteState() : null,
      localHud: hud,
      countdownSecondsRemaining,
      finished: this.finished,
      winnerId: this.winnerId,
      message,
      raceTimeSeconds: this.raceTimeSeconds,
      localFinishTimeSeconds: this.localProgress.finishTimeSeconds,
      limiterCutTriggered: limiterCut,
    };
  }

  /**
   * HUD RPM with launch revs and a rate-limited needle: holding throttle on the
   * line (or wheelspinning off it) sends the revs into the limiter, and gear
   * changes sweep the needle down at a bounded speed instead of teleporting it.
   *
   * Returns whether the ignition-cut limiter fired this frame, so the race
   * screen can stutter the engine sound in sync with the bouncing needle.
   */
  private deriveSmoothedHud(
    racing: boolean,
    input: CarInput,
    dtSeconds: number,
  ): { hud: HudState; limiterCut: boolean } {
    const engine = this.config.localCar.engine;
    const base = deriveHudState(this.localState.speedKmh, this.config.localCar.stats, engine);

    let targetRpm = base.rpm;
    const launching =
      input.throttle &&
      !this.finished &&
      (!racing || this.localState.speedKmh < LAUNCH_WHEELSPIN_MAX_KMH);
    if (launching) {
      // Free-revving drives the engine straight into the limiter.
      targetRpm = engine.redlineRpm;
    }

    const maxStep = RPM_NEEDLE_RATE_PER_SEC * dtSeconds;
    this.displayedRpm += Math.max(-maxStep, Math.min(maxStep, targetRpm - this.displayedRpm));

    // Ignition cut: touching the redline under throttle kills spark, the revs
    // drop, then climb back — the needle bounces off the red zone.
    let limiterCut = false;
    if (input.throttle && !this.finished && this.displayedRpm >= engine.redlineRpm - 1) {
      this.displayedRpm = engine.redlineRpm - LIMITER_CUT_DROP_RPM;
      limiterCut = true;
    }

    return { hud: { ...base, rpm: this.displayedRpm }, limiterCut };
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

  private curvatureAt(distanceMeters: number): number {
    return this.config.trackCurvature?.(distanceMeters) ?? 0;
  }

  private countdownSecondsRemaining(): number | null {
    if (this.startAtEpochMs === null) return null;
    const remaining = (this.startAtEpochMs - this.now()) / 1000;
    // Null once the "GO!" flash has run its course, so the HUD stops drawing it.
    if (remaining <= -GO_DISPLAY_SECONDS) return null;
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
    this.config.peer?.send(encodeRaceMessage(message));
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
