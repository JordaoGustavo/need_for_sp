import { describe, expect, it } from "vitest";
import { buildInviteUrl, generateRoomCode, parseRoomCodeFromUrl, ROOM_CODE_LENGTH } from "../../src/net/roomCode";

describe("generateRoomCode", () => {
  it("generates a code of the expected length using only unambiguous characters", () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(ROOM_CODE_LENGTH);
    expect(code).toMatch(/^[A-Z0-9]+$/);
    expect(code).not.toMatch(/[01OI]/); // avoid visually ambiguous chars in a link people type/read aloud
  });

  it("generates different codes across calls (extremely unlikely to collide)", () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateRoomCode()));
    expect(codes.size).toBeGreaterThan(45);
  });
});

describe("buildInviteUrl / parseRoomCodeFromUrl", () => {
  it("round-trips a room code through an invite URL", () => {
    const url = buildInviteUrl("https://need-for-sp.example/", "AB23CD");
    expect(parseRoomCodeFromUrl(url)).toBe("AB23CD");
  });

  it("preserves the base URL's path", () => {
    const url = buildInviteUrl("https://need-for-sp.example/play", "AB23CD");
    expect(url.startsWith("https://need-for-sp.example/play?")).toBe(true);
  });

  it("returns null when the URL has no room param", () => {
    expect(parseRoomCodeFromUrl("https://need-for-sp.example/")).toBeNull();
  });
});
