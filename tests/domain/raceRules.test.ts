import { describe, expect, it } from "vitest";
import { CircuitRaceRules, DragRaceRules } from "../../src/domain/raceRules";
import { createInitialRaceProgress, type TrackDefinition } from "../../src/domain/track";
import { createInitialCarRuntimeState } from "../../src/domain/car";

const dragTrack: TrackDefinition = {
  id: "bandeirantita",
  description: "test drag",
  scenery: "highway" as const,
  displayName: "Bandeirantita",
  raceType: "drag",
  lengthMeters: 400,
  laps: 1,
  checkpoints: [],
  widthMeters: 8,
};

const circuitTrack: TrackDefinition = {
  id: "interlagos",
  description: "test circuit",
  scenery: "city" as const,
  displayName: "Interlagos",
  raceType: "circuit",
  lengthMeters: 1000,
  laps: 2,
  checkpoints: [
    { id: "cp1", distanceMeters: 500 },
  ],
  widthMeters: 10,
};

describe("DragRaceRules", () => {
  const rules = new DragRaceRules();

  it("does not mark the player finished before reaching the track length", () => {
    const progress = createInitialRaceProgress("p1");
    const car = { ...createInitialCarRuntimeState("p1"), distanceMeters: 399 };
    const next = rules.updateProgress(progress, car, dragTrack, 5);
    expect(next.finished).toBe(false);
    expect(next.finishTimeSeconds).toBeNull();
  });

  it("marks the player finished once distance reaches the track length, recording the finish time", () => {
    const progress = createInitialRaceProgress("p1");
    const car = { ...createInitialCarRuntimeState("p1"), distanceMeters: 400 };
    const next = rules.updateProgress(progress, car, dragTrack, 12.5);
    expect(next.finished).toBe(true);
    expect(next.finishTimeSeconds).toBe(12.5);
  });

  it("does not overwrite the finish time on subsequent ticks", () => {
    let progress = createInitialRaceProgress("p1");
    const car = { ...createInitialCarRuntimeState("p1"), distanceMeters: 400 };
    progress = rules.updateProgress(progress, car, dragTrack, 12.5);
    const next = rules.updateProgress(progress, { ...car, distanceMeters: 420 }, dragTrack, 13.0);
    expect(next.finishTimeSeconds).toBe(12.5);
  });
});

describe("CircuitRaceRules", () => {
  const rules = new CircuitRaceRules();

  it("advances to the next checkpoint once the car passes its distance", () => {
    const progress = createInitialRaceProgress("p1");
    const car = { ...createInitialCarRuntimeState("p1"), distanceMeters: 500 };
    const next = rules.updateProgress(progress, car, circuitTrack, 20);
    expect(next.nextCheckpointIndex).toBe(1);
  });

  it("completes a lap only after all checkpoints were passed, and resets the checkpoint pointer", () => {
    let progress = createInitialRaceProgress("p1");
    let car = { ...createInitialCarRuntimeState("p1"), distanceMeters: 500 };
    progress = rules.updateProgress(progress, car, circuitTrack, 20); // passes checkpoint
    car = { ...car, distanceMeters: 1000 }; // completes lap 1
    progress = rules.updateProgress(progress, car, circuitTrack, 40);
    expect(progress.lapsCompleted).toBe(1);
    expect(progress.nextCheckpointIndex).toBe(0);
    expect(progress.finished).toBe(false); // track has 2 laps
  });

  it("does NOT count a lap if the car crosses the finish distance without passing all checkpoints first", () => {
    const progress = createInitialRaceProgress("p1");
    // distance jumps straight past the finish line without ever reporting the checkpoint crossing
    const car = { ...createInitialCarRuntimeState("p1"), distanceMeters: 1000 };
    const next = rules.updateProgress(progress, car, circuitTrack, 40);
    expect(next.lapsCompleted).toBe(0);
  });

  it("finishes the race once the required number of laps is completed", () => {
    let progress = createInitialRaceProgress("p1");
    let car = { ...createInitialCarRuntimeState("p1"), distanceMeters: 500 };
    progress = rules.updateProgress(progress, car, circuitTrack, 10);
    car = { ...car, distanceMeters: 1000 };
    progress = rules.updateProgress(progress, car, circuitTrack, 20); // lap 1 done
    car = { ...car, distanceMeters: 1500 };
    progress = rules.updateProgress(progress, car, circuitTrack, 30);
    car = { ...car, distanceMeters: 2000 };
    progress = rules.updateProgress(progress, car, circuitTrack, 40); // lap 2 done -> finished
    expect(progress.lapsCompleted).toBe(2);
    expect(progress.finished).toBe(true);
    expect(progress.finishTimeSeconds).toBe(40);
  });
});
