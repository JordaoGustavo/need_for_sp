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
  /** Road elevation at this point (visual only; physics stays 2D). */
  readonly y: number;
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
  /** Road elevation at this sample. */
  readonly y: number;
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
    y: 0,
    z: -distanceMeters,
    forwardAngleRad: 0,
  });
  return {
    closed: false,
    pose,
    sample(stepMeters, fromMeters, toMeters) {
      const samples: TrackSample[] = [];
      for (let d = fromMeters; d <= toMeters; d += stepMeters) {
        samples.push({ d, x: 0, y: 0, z: -d, nx: 1, nz: 0 });
      }
      return samples;
    },
  };
}

function createCurveModel(track: TrackDefinition, closed: boolean): TrackPathModel {
  const rawPoints = track.path!.map((p) => new THREE.Vector3(p.x, 0, p.z));
  const rawCurve = new THREE.CatmullRomCurve3(rawPoints, closed, "centripetal");

  // Densify and relax the polyline: sparse hand-placed control points pinch
  // at corners (radius smaller than the road+run-off reach folds the
  // ribbons). Resampling every ~10m and running a few moving-average passes
  // rounds every corner to a drivable radius while keeping the layout.
  const sampleCount = Math.max(48, Math.ceil(rawCurve.getLength() / 10));
  let relaxed: THREE.Vector3[] = [];
  for (let i = 0; i < sampleCount; i++) {
    relaxed.push(rawCurve.getPointAt(i / (closed ? sampleCount : sampleCount - 1)));
  }
  for (let pass = 0; pass < 4; pass++) {
    relaxed = relaxed.map((p, i) => {
      if (!closed && (i === 0 || i === relaxed.length - 1)) return p;
      const prev = relaxed[(i - 1 + relaxed.length) % relaxed.length]!;
      const next = relaxed[(i + 1) % relaxed.length]!;
      return new THREE.Vector3((prev.x + 2 * p.x + next.x) / 4, 0, (prev.z + 2 * p.z + next.z) / 4);
    });
  }

  // Rescale so the arc length matches the declared track length — progress,
  // checkpoints and world geometry then agree exactly.
  const relaxedCurve = new THREE.CatmullRomCurve3(relaxed, closed, "centripetal");
  const scale = track.lengthMeters / relaxedCurve.getLength();
  const points = relaxed.map((p) => p.multiplyScalar(scale));
  const curve = new THREE.CatmullRomCurve3(points, closed, "centripetal");
  const length = track.lengthMeters;

  // Visual elevation profile: smoothstep-interpolated between key points,
  // clamped flat beyond the ends.
  const elevationPoints = [...(track.elevation ?? [])].sort((a, b) => a.atMeters - b.atMeters);
  const elevationAt = (distanceMeters: number): number => {
    if (elevationPoints.length === 0) return 0;
    const first = elevationPoints[0]!;
    const last = elevationPoints[elevationPoints.length - 1]!;
    if (distanceMeters <= first.atMeters) return first.yMeters;
    if (distanceMeters >= last.atMeters) return last.yMeters;
    for (let i = 0; i < elevationPoints.length - 1; i++) {
      const a = elevationPoints[i]!;
      const b = elevationPoints[i + 1]!;
      if (distanceMeters >= a.atMeters && distanceMeters <= b.atMeters) {
        const t = (distanceMeters - a.atMeters) / Math.max(1, b.atMeters - a.atMeters);
        const eased = t * t * (3 - 2 * t);
        return a.yMeters + (b.yMeters - a.yMeters) * eased;
      }
    }
    return last.yMeters;
  };

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
      y: elevationAt(distanceMeters),
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
        samples.push({ d, x: p.x, y: elevationAt(d), z: p.z, nx: -t.z, nz: t.x });
      }
      return samples;
    },
  };
}
