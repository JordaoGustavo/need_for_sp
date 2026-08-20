import type { CarInput } from "../domain/car";

/**
 * Reads keyboard state into CarInput. Kept separate from RaceSession so input source
 * (keyboard now, gamepad/touch later) can change without touching race logic.
 */
export class KeyboardInputController {
  private readonly pressed = new Set<string>();

  constructor(private readonly target: Window = window) {
    this.target.addEventListener("keydown", this.handleKeyDown);
    this.target.addEventListener("keyup", this.handleKeyUp);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    this.pressed.add(event.key.toLowerCase());
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.pressed.delete(event.key.toLowerCase());
  };

  read(): CarInput {
    const throttle = this.pressed.has("arrowup") || this.pressed.has("w");
    const brake = this.pressed.has("arrowdown") || this.pressed.has("s");
    const left = this.pressed.has("arrowleft") || this.pressed.has("a");
    const right = this.pressed.has("arrowright") || this.pressed.has("d");

    let steer = 0;
    if (left) steer -= 1;
    if (right) steer += 1;

    const nitro = this.pressed.has("shift"); // Shift ONLY
    const handbrake = this.pressed.has(" "); // Space = freio de mão

    return { throttle, brake, steer, nitro, handbrake };
  }

  dispose(): void {
    this.target.removeEventListener("keydown", this.handleKeyDown);
    this.target.removeEventListener("keyup", this.handleKeyUp);
  }
}
