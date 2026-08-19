import * as THREE from "three";
import type { TrackDefinition } from "../../domain/track";

/**
 * Maps the simulation's path coordinates (distance along the centerline +
 * lateral offset) into world space. Physics stays 1D+lateral either way
 * (ADR 0007): tracks are a straight line (no path), an open curved run
 * (drag with path points — e.g. a highway section), or a closed circuit
 * loop. Curves are rescaled so the path length equals track.lengthMeters.
 */

export interface TrackPose {
  readonly x: number;
  readonly z: number;
  /**
   * Track direction at this point, as the yaw to add to a car's own heading
   * (0 = world -Z, the straight-strip forward).
   */
  readonly forwardAngleRad: number;
}

export interface TrackSample {
  /** Distance along the path this sample corresponds to, in meters. */
  readonly d: number;
  readonly x: number;
  readonly z: number;
  /** Unit normal (left-to-right across the road). */
  readonly nx: number;
  readonly nz: number;
}

export interface TrackPathModel {
  readonly closed: boolean;
  pose(distanceMeters: number, lateralMeters: number): TrackPose;
  /**
   * Centerline sampled every ~stepMeters over [fromMeters, toMeters]
   * (distances beyond an open path's ends extrapolate along its end tangents;
   * closed loops wrap).
   */
  sample(stepMeters: number, fromMeters: number, toMeters: number): TrackSample[];
}

export function createTrackPathModel(track: TrackDefinition): TrackPathModel {
  if (track.path && track.path.length >= 3) {
    return createCurveModel(track, track.raceType === "circuit");
  }
  return createStraightModel();
}

function createStraightModel(): TrackPathModel {
  const pose = (distanceMeters: number, lateralMeters: number): TrackPose => ({
    x: lateralMeters,
    z: -distanceMeters,
    forwardAngleRad: 0,
  });
  return {
    closed: false,
    pose,
    sample(stepMeters, fromMeters, toMeters) {
      const samples: TrackSample[] = [];
      for (let d = fromMeters; d <= toMeters; d += stepMeters) {
        samples.push({ d, x: 0, z: -d, nx: 1, nz: 0 });
      }
      return samples;
    },
  };
}

function createCurveModel(track: TrackDefinition, closed: boolean): TrackPathModel {
  const rawPoints = track.path!.map((p) => new THREE.Vector3(p.x, 0, p.z));
  const rawCurve = new THREE.CatmullRomCurve3(rawPoints, closed, "centripetal");
  // Rescale so the arc length matches the declared track length — progress,
  // checkpoints and world geometry then agree exactly.
  const scale = track.lengthMeters / rawCurve.getLength();
  const points = rawPoints.map((p) => p.multiplyScalar(scale));
  const curve = new THREE.CatmullRomCurve3(points, closed, "centripetal");
  const length = track.lengthMeters;

  const pointAndTangentAt = (distanceMeters: number): { p: THREE.Vector3; t: THREE.Vector3 } => {
    if (closed) {
      const wrapped = ((distanceMeters % length) + length) % length;
      const u = curve.getUtoTmapping(wrapped / length, 0);
      return { p: curve.getPoint(u), t: curve.getTangent(u).normalize() };
    }
    // Open path: extrapolate straight along the end tangents beyond the ends
    // (start backstop / finish runoff live out there).
    if (distanceMeters < 0) {
      const t = curve.getTangent(0).normalize();
      return { p: curve.getPoint(0).clone().addScaledVector(t, distanceMeters), t };
    }
    if (distanceMeters > length) {
      const t = curve.getTangent(1).normalize();
      return { p: curve.getPoint(1).clone().addScaledVector(t, distanceMeters - length), t };
    }
    const u = curve.getUtoTmapping(distanceMeters / length, 0);
    return { p: curve.getPoint(u), t: curve.getTangent(u).normalize() };
  };

  const pose = (distanceMeters: number, lateralMeters: number): TrackPose => {
    const { p, t } = pointAndTangentAt(distanceMeters);
    const nx = -t.z;
    const nz = t.x;
    return {
      x: p.x + nx * lateralMeters,
      z: p.z + nz * lateralMeters,
      forwardAngleRad: Math.atan2(t.x, -t.z),
    };
  };

  return {
    closed,
    pose,
    sample(stepMeters, fromMeters, toMeters) {
      const samples: TrackSample[] = [];
      for (let d = fromMeters; d <= toMeters; d += stepMeters) {
        const { p, t } = pointAndTangentAt(d);
        samples.push({ d, x: p.x, z: p.z, nx: -t.z, nz: t.x });
      }
      return samples;
    },
  };
}
