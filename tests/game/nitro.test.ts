import { describe, expect, it } from "vitest";
import { RaceSession } from "../../src/game/raceSession";
import { BANDEIRANTITA } from "../../src/content/tracks/bandeirantita";
import { CARS } from "../../src/content/cars";

function soloSession(clock: { nowMs: number }): RaceSession {
  const session = new RaceSession({
    track: BANDEIRANTITA,
    localCar: CARS[0]!,
    localPlayerId: "solo",
    remotePlayerId: "ghost",
    isHost: true,
    peer: null,
    now: () => clock.nowMs,
  });
  session.start();
  // Skip past the countdown.
  clock.nowMs += 4000;
  return session;
}

const DT = 1 / 60;

describe("NOS", () => {
  it("boosts acceleration while spraying and drains the single bottle", () => {
    const clock = { nowMs: 0 };
    const plain = soloSession(clock);
    const clock2 = { nowMs: 0 };
    const boosted = soloSession(clock2);

    let plainSnap = plain.update(0, { throttle: true, brake: false, steer: 0 });
    let boostedSnap = boosted.update(0, { throttle: true, brake: false, steer: 0 });
    for (let f = 0; f < 120; f++) {
      clock.nowMs += DT * 1000;
      clock2.nowMs += DT * 1000;
      plainSnap = plain.update(DT, { throttle: true, brake: false, steer: 0 });
      boostedSnap = boosted.update(DT, { throttle: true, brake: false, steer: 0, nitro: true });
    }
    expect(boostedSnap.localState.speedKmh).toBeGreaterThan(plainSnap.localState.speedKmh + 20);
    expect(boostedSnap.nitroRemaining).toBeLessThan(1);
    expect(boostedSnap.nitroRemaining).toBeGreaterThan(0);
  });

  it("holding the button continuously blows the engine and loses the race", () => {
    const clock = { nowMs: 0 };
    const session = soloSession(clock);
    let snap = session.update(0, { throttle: true, brake: false, steer: 0 });
    for (let f = 0; f < 60 * 4 && !snap.engineBlown; f++) {
      clock.nowMs += DT * 1000;
      snap = session.update(DT, { throttle: true, brake: false, steer: 0, nitro: true });
    }
    expect(snap.engineBlown).toBe(true);
    expect(snap.finished).toBe(true);
    expect(snap.winnerId).toBe("ghost"); // not the local player: the race is lost
    // Blew from heat before the bottle was empty.
    expect(snap.nitroRemaining).toBeGreaterThan(0);
  });

  it("pulsing the button is safe: heat cools down between bursts", () => {
    const clock = { nowMs: 0 };
    const session = soloSession(clock);
    let snap = session.update(0, { throttle: true, brake: false, steer: 0 });
    // 1.5s on / 1.5s off, until the bottle runs dry.
    for (let f = 0; f < 60 * 30 && snap.nitroRemaining > 0; f++) {
      clock.nowMs += DT * 1000;
      const phase = Math.floor((f / 60) / 1.5) % 2 === 0;
      snap = session.update(DT, { throttle: true, brake: false, steer: 0, nitro: phase });
    }
    expect(snap.engineBlown).toBe(false);
    expect(snap.nitroRemaining).toBe(0);
    // Empty bottle never refills and never boosts again.
    clock.nowMs += DT * 1000;
    snap = session.update(DT, { throttle: true, brake: false, steer: 0, nitro: true });
    expect(snap.nitroActive).toBe(false);
    expect(snap.nitroRemaining).toBe(0);
  });
});
