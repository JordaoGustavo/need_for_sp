import { describe, expect, it } from "vitest";
import { getIdentityToken } from "../../src/game/playerIdentity";

describe("identity token", () => {
  // In this node environment localStorage does not exist, which exercises the
  // same fallback path a browser hits in private mode: the token must still be
  // stable within the page, not a fresh throwaway per call (the old
  // "volatile-" behavior burned nicks on the server).
  it("is stable across calls even without localStorage", () => {
    const first = getIdentityToken();
    const second = getIdentityToken();
    expect(second).toBe(first);
  });

  it("is a 32-char hex secret, never a volatile marker", () => {
    const token = getIdentityToken();
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(token.startsWith("volatile-")).toBe(false);
  });
});
