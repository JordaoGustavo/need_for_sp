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

/** One NOS bottle per race: total seconds of boost, never refilled. */
const NITRO_BOTTLE_SECONDS = 6;
/** Holding the boost this long CONTINUOUSLY blows the engine. Pulse it. */
const NITRO_BLOW_SECONDS = 3.2;
/** Seconds for a fully-heated engine to cool back down when off the button. */
const NITRO_COOL_SECONDS = 2.8;
/** Extra shove while spraying, in km/h per second, plus a top-speed bump. */
const NITRO_EXTRA_ACCEL_KMH_PER_SEC = 26;
const NITRO_TOP_SPEED_FACTOR = 1.08;

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
  /**
   * Road grade (dY/dDistance, positive uphill) at a given distance — the
   * physics' gravity term (see createTrackSlope). Omit for flat tracks.
   */
  readonly trackSlope?: (distanceMeters: number) => number;
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
  /** NOS bottle left (0..1). */
  readonly nitroRemaining: number;
  /** Engine heat from continuous NOS (0..1); 1 = blown. */
  readonly nitroHeat: number;
  readonly nitroActive: boolean;
  /** true once the engine blew from NOS abuse — the race is lost. */
  readonly engineBlown: boolean;
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
  /** Race start in the HOST's wall clock; guests convert via clockOffsetMs. */
  private startAtEpochMs: number | null = null;
  /** Guest's estimate of (host clock − local clock); 0 on the host and solo. */
  private clockOffsetMs = 0;
  private bestClockPingRttMs = Number.POSITIVE_INFINITY;
  private clockPingsSent = 0;
  private lastClockPingAtMs = 0;
  private raceTimeSeconds = 0;
  private timeSinceLastSendSeconds = 0;

  private finished = false;
  private winnerId: string | null = null;
  private displayedRpm: number;
  private nitroRemaining = 1;
  private nitroHeat = 0;
  private nitroActiveThisFrame = false;
  private engineBlown = false;

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
    } else {
      this.sendClockPing();
    }
  }

  /**
   * NTP-style clock sync: the guest pings a few times, the host echoes its
   * clock, and the lowest-RTT sample wins. hostNow() then lets the guest
   * compare startAtEpochMs (host clock) fairly, so both cars launch together
   * even when the machines' wall clocks disagree.
   */
  private sendClockPing(): void {
    this.clockPingsSent++;
    this.lastClockPingAtMs = this.now();
    this.send({ type: "clockPing", sentAtMs: this.lastClockPingAtMs });
  }

  private hostNow(): number {
    return this.now() + this.clockOffsetMs;
  }

  /** Advances local simulation by dtSeconds using the given input. Call once per frame. */
  update(dtSeconds: number, input: CarInput): RaceSessionSnapshot {
    // Guests refine the clock offset with a few extra pings (best of 5).
    if (this.config.peer && !this.config.isHost && this.clockPingsSent > 0 && this.clockPingsSent < 5 && this.now() - this.lastClockPingAtMs > 250) {
      this.sendClockPing();
    }

    const countdownRemaining = this.countdownSecondsRemaining();
    const racing = this.startAtEpochMs !== null && this.hostNow() >= this.startAtEpochMs;

    if (racing && !this.finished) {
      this.raceTimeSeconds += dtSeconds;

      // NOS: one bottle, no refills; continuous abuse overheats and blows
      // the engine — pulse the button instead of holding it.
      this.nitroActiveThisFrame =
        input.nitro === true && input.throttle && this.nitroRemaining > 0 && !this.engineBlown;
      if (this.nitroActiveThisFrame) {
        this.nitroRemaining = Math.max(0, this.nitroRemaining - dtSeconds / NITRO_BOTTLE_SECONDS);
        this.nitroHeat += dtSeconds / NITRO_BLOW_SECONDS;
        if (this.nitroHeat >= 1) {
          this.blowEngine();
        }
      } else {
        this.nitroHeat = Math.max(0, this.nitroHeat - dtSeconds / NITRO_COOL_SECONDS);
      }

      const baseStats = this.config.localCar.stats;
      const effectiveStats = this.nitroActiveThisFrame
        ? {
            ...baseStats,
            accelerationKmhPerSec: baseStats.accelerationKmhPerSec + NITRO_EXTRA_ACCEL_KMH_PER_SEC,
            topSpeedKmh: baseStats.topSpeedKmh * NITRO_TOP_SPEED_FACTOR,
          }
        : baseStats;

      this.localState = stepCarPhysics(
        this.localState,
        effectiveStats,
        input,
        dtSeconds,
        this.curvatureAt(this.localState.distanceMeters),
        this.slopeAt(this.localState.distanceMeters),
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
        this.slopeAt(this.localState.distanceMeters),
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
      nitroRemaining: this.nitroRemaining,
      nitroHeat: this.nitroHeat,
      nitroActive: this.nitroActiveThisFrame,
      engineBlown: this.engineBlown,
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

    // A blown engine winds down to zero and stays dead.
    if (this.engineBlown) targetRpm = 0;

    const maxStep = RPM_NEEDLE_RATE_PER_SEC * dtSeconds;
    this.displayedRpm += Math.max(-maxStep, Math.min(maxStep, targetRpm - this.displayedRpm));

    // Ignition cut: touching the redline under throttle kills spark, the revs
    // drop, then climb back — the needle bounces off the red zone.
    let limiterCut = false;
    if (input.throttle && !this.finished && this.displayedRpm >= engine.redlineRpm - 1) {
      this.displayedRpm = engine.redlineRpm - LIMITER_CUT_DROP_RPM;
      limiterCut = true;
    }

    return {
      hud: {
        ...base,
        rpm: this.displayedRpm,
        nitroRemaining: this.nitroRemaining,
        nitroHeat: this.nitroHeat,
        nitroActive: this.nitroActiveThisFrame,
      },
      limiterCut,
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
      velocityAngleRad: lerp(previous.state.velocityAngleRad, latest.state.velocityAngleRad, factor),
    };
  }

  /**
   * NOS abuse: the engine lets go. The race ends immediately and the OTHER
   * player wins (solo: you simply lose). The car coasts out via the finished
   * roll-down path.
   */
  private blowEngine(): void {
    if (this.engineBlown) return;
    this.engineBlown = true;
    this.finished = true;
    this.winnerId = this.config.remotePlayerId;
    this.send({ type: "engineBlown", playerId: this.config.localPlayerId });
    if (this.config.isHost) {
      this.send({
        type: "raceFinished",
        winnerId: this.config.remotePlayerId,
        finishTimeSeconds: this.raceTimeSeconds,
      });
    }
  }

  private slopeAt(distanceMeters: number): number {
    return this.config.trackSlope?.(distanceMeters) ?? 0;
  }

  private curvatureAt(distanceMeters: number): number {
    return this.config.trackCurvature?.(distanceMeters) ?? 0;
  }

  private countdownSecondsRemaining(): number | null {
    if (this.startAtEpochMs === null) return null;
    const remaining = (this.startAtEpochMs - this.hostNow()) / 1000;
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
      case "clockPing":
        this.send({ type: "clockPong", pingSentAtMs: message.sentAtMs, hostNowMs: this.now() });
        return;
      case "clockPong": {
        const nowMs = this.now();
        const rttMs = nowMs - message.pingSentAtMs;
        if (rttMs >= 0 && rttMs < this.bestClockPingRttMs) {
          this.bestClockPingRttMs = rttMs;
          this.clockOffsetMs = message.hostNowMs + rttMs / 2 - nowMs;
        }
        return;
      }
      case "carState": {
        // Defensive: a stale peer build without the drift field must not NaN us.
        const state = {
          ...message.state,
          velocityAngleRad: message.state.velocityAngleRad ?? message.state.headingRad,
        };
        this.previousRemoteSnapshot = this.latestRemoteSnapshot;
        this.latestRemoteSnapshot = { state, receivedAtMs: this.now() };
        this.remoteState = state;
        return;
      }
      case "raceFinished":
        this.finished = true;
        this.winnerId = message.winnerId;
        return;
      case "engineBlown":
        // The other player's engine let go — race over, we win. The host also
        // broadcasts the authoritative result.
        this.finished = true;
        this.winnerId = this.config.localPlayerId;
        if (this.config.isHost) {
          this.send({
            type: "raceFinished",
            winnerId: this.config.localPlayerId,
            finishTimeSeconds: this.raceTimeSeconds,
          });
        }
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
