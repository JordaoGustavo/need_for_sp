import { describe, expect, it } from "vitest";
import { RaceSession } from "../../src/game/raceSession";
import { BANDEIRANTITA } from "../../src/content/tracks/bandeirantita";
import { CARS } from "../../src/content/cars";
import type { PeerConnection } from "../../src/net/webrtcConnection";
import { NEUTRAL_INPUT } from "../../src/domain/car";

const DT = 1 / 60;

/** In-memory peer pair: send() on one side delivers to the other's onMessage. */
function fakePeerPair(): [PeerConnection, PeerConnection] {
  const handlers: [Array<(data: string) => void>, Array<(data: string) => void>] = [[], []];
  const make = (mine: 0 | 1): PeerConnection => ({
    send(data: string): void {
      for (const cb of handlers[mine === 0 ? 1 : 0]) cb(data);
    },
    onMessage(cb: (data: string) => void): void {
      handlers[mine].push(cb);
    },
    onOpen(): void {},
    onClose(): void {},
    close(): void {},
  });
  return [make(0), make(1)];
}

describe("multiplayer race start sync", () => {
  it("both players launch together even with wall-clock skew between machines", () => {
    // Shared "real" time; the guest's wall clock runs 2.7 s ahead of the host's.
    const real = { ms: 1_000_000 };
    const GUEST_SKEW_MS = 2700;

    const [hostPeer, guestPeer] = fakePeerPair();
    const host = new RaceSession({
      track: BANDEIRANTITA,
      localCar: CARS[0]!,
      localPlayerId: "host",
      remotePlayerId: "guest",
      isHost: true,
      peer: hostPeer,
      now: () => real.ms,
    });
    const guest = new RaceSession({
      track: BANDEIRANTITA,
      localCar: CARS[1]!,
      localPlayerId: "guest",
      remotePlayerId: "host",
      isHost: false,
      peer: guestPeer,
      now: () => real.ms + GUEST_SKEW_MS,
    });

    // Guest pings for clock sync; host's hello+raceStart arm the countdown.
    guest.start();
    host.start();

    // Mid-countdown both agree on the remaining time (within one frame).
    real.ms += 1000;
    const hostMid = host.update(DT, NEUTRAL_INPUT);
    const guestMid = guest.update(DT, NEUTRAL_INPUT);
    expect(hostMid.countdownSecondsRemaining).not.toBeNull();
    expect(guestMid.countdownSecondsRemaining).not.toBeNull();
    expect(Math.abs(hostMid.countdownSecondsRemaining! - guestMid.countdownSecondsRemaining!)).toBeLessThan(0.05);

    // Just past the start both are racing: throttle moves BOTH cars.
    real.ms += 2100;
    const throttle = { ...NEUTRAL_INPUT, throttle: true };
    const hostGo = host.update(DT, throttle);
    const guestGo = guest.update(DT, throttle);
    expect(hostGo.localState.speedKmh).toBeGreaterThan(0);
    expect(guestGo.localState.speedKmh).toBeGreaterThan(0);
  });
});
