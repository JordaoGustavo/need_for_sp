import * as THREE from "three";
import type { TrackDefinition } from "../../domain/track";

/**
 * Maps the simulation's path coordinates (distance along the centerline +
 * lateral offset) into world space. Physics stays 1D+lateral either way
 * (ADR 0007): a drag strip is a straight line, a circuit is a closed
 * Catmull-Rom loop rescaled so one lap equals track.lengthMeters.
 */

export interface TrackPose {
  readonly x: number;
  readonly z: number;
  /**
   * Track direction at this point, as the yaw to add to a car's own heading
   * (0 = world -Z, the drag-strip forward).
   */
  readonly forwardAngleRad: number;
}

export interface TrackSample {
  readonly x: number;
  readonly z: number;
  /** Unit normal (left-to-right across the road). */
  readonly nx: number;
  readonly nz: number;
}

export interface TrackPathModel {
  readonly closed: boolean;
  pose(distanceMeters: number, lateralMeters: number): TrackPose;
  /** Centerline sampled every ~stepMeters (one full lap for circuits). */
  sample(stepMeters: number): TrackSample[];
}

export function createTrackPathModel(track: TrackDefinition): TrackPathModel {
  if (track.raceType === "circuit" && track.path && track.path.length >= 3) {
    return createCircuitModel(track);
  }
  return createStraightModel(track);
}

function createStraightModel(track: TrackDefinition): TrackPathModel {
  return {
    closed: false,
    pose(distanceMeters, lateralMeters) {
      return { x: lateralMeters, z: -distanceMeters, forwardAngleRad: 0 };
    },
    sample(stepMeters) {
      const samples: TrackSample[] = [];
      for (let d = -20; d <= track.lengthMeters + 120; d += stepMeters) {
        samples.push({ x: 0, z: -d, nx: 1, nz: 0 });
      }
      return samples;
    },
  };
}

function createCircuitModel(track: TrackDefinition): TrackPathModel {
  const rawPoints = track.path!.map((p) => new THREE.Vector3(p.x, 0, p.z));
  const rawCurve = new THREE.CatmullRomCurve3(rawPoints, true, "centripetal");
  // Rescale the loop so its arc length matches the declared lap length —
  // progress/checkpoint logic and the world geometry then agree exactly.
  const scale = track.lengthMeters / rawCurve.getLength();
  const points = rawPoints.map((p) => p.multiplyScalar(scale));
  const curve = new THREE.CatmullRomCurve3(points, true, "centripetal");

  const pose = (distanceMeters: number, lateralMeters: number): TrackPose => {
    const lap = track.lengthMeters;
    const wrapped = ((distanceMeters % lap) + lap) % lap;
    const u = curve.getUtoTmapping(wrapped / lap, 0);
    const point = curve.getPoint(u);
    const tangent = curve.getTangent(u).normalize();
    // Normal pointing to the car's +lateral side (right of travel).
    const nx = -tangent.z;
    const nz = tangent.x;
    return {
      x: point.x + nx * lateralMeters,
      z: point.z + nz * lateralMeters,
      forwardAngleRad: Math.atan2(tangent.x, -tangent.z),
    };
  };

  return {
    closed: true,
    pose,
    sample(stepMeters) {
      const count = Math.max(32, Math.ceil(track.lengthMeters / stepMeters));
      const samples: TrackSample[] = [];
      for (let i = 0; i <= count; i++) {
        const u = curve.getUtoTmapping(i / count, 0);
        const point = curve.getPoint(u);
        const tangent = curve.getTangent(u).normalize();
        samples.push({ x: point.x, z: point.z, nx: -tangent.z, nz: tangent.x });
      }
      return samples;
    },
  };
}
