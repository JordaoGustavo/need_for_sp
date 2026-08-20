import { describe, expect, it } from "vitest";
import { KeyboardInputController } from "../../src/game/inputController";

/** Minimal fake Window: captures the key handlers so tests can fire keys. */
function makeFakeTarget() {
  const handlers = new Map<string, (event: { key: string }) => void>();
  const target = {
    addEventListener: (type: string, handler: (event: { key: string }) => void) => {
      handlers.set(type, handler);
    },
    removeEventListener: () => {},
  } as unknown as Window;
  return {
    target,
    press: (key: string) => handlers.get("keydown")!({ key }),
    release: (key: string) => handlers.get("keyup")!({ key }),
  };
}

describe("keyboard mapping", () => {
  it("Space is the handbrake, NOT nitro", () => {
    const { target, press } = makeFakeTarget();
    const controller = new KeyboardInputController(target);
    press(" ");
    const input = controller.read();
    expect(input.handbrake).toBe(true);
    expect(input.nitro).toBe(false);
  });

  it("Shift is nitro, NOT the handbrake", () => {
    const { target, press } = makeFakeTarget();
    const controller = new KeyboardInputController(target);
    press("Shift");
    const input = controller.read();
    expect(input.nitro).toBe(true);
    expect(input.handbrake).toBe(false);
  });

  it("releasing Space releases the handbrake", () => {
    const { target, press, release } = makeFakeTarget();
    const controller = new KeyboardInputController(target);
    press(" ");
    release(" ");
    expect(controller.read().handbrake).toBe(false);
  });
});
