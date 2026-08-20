/**
 * One-time extractor: builds src/content/tracks/nordschleifeData.ts from real
 * Nürburgring Nordschleife data.
 *
 *   npx tsx scripts/extractNordschleife.ts
 *
 * Pipeline:
 *   1. Fetch the centerline ways from OpenStreetMap (Overpass API) and stitch
 *      them into one closed loop.
 *   2. Project lat/lon to local meters (equirectangular about the centroid).
 *   3. Fetch elevation for the centerline from Open Topo Data (EU-DEM 25m).
 *   4. Resample at 5 m arc length, scale the whole thing (XZ AND elevation,
 *      same factor, so real gradients are preserved) to TARGET_LENGTH_METERS.
 *   5. Orient/rotate the loop: start at the point nearest the Nürburg castle
 *      (the start/finish straight), driving direction such that the descent to
 *      Breidscheid comes before the climb to Hohe Acht.
 *   6. Clamp the minimum corner radius (the game's road+runoff needs ~27 m or
 *      the ribbon geometry folds), then decimate to ~20 m control points.
 *   7. Compute landmark distances (fractions of the real lap) and write the
 *      TypeScript data module.
 *
 * The generated file is committed — the game has no runtime network
 * dependency. Data © OpenStreetMap contributors, ODbL (see CREDITS.md).
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TARGET_LENGTH_METERS = 5000;
const MIN_RADIUS_METERS = 27;
const RESAMPLE_STEP_METERS = 5;
const CONTROL_POINT_SPACING_METERS = 20;
/** Real tourist-lap length the landmark km markers below refer to. */
const REAL_LAP_KM = 20.8;

/** Nürburg castle — the loop's closest point to it is the start/finish area. */
const START_ANCHOR = { lat: 50.3394, lon: 6.9457 };

/** Famous corners as km markers of the real lap (checkpoint candidates). */
const LANDMARKS_KM: readonly { id: string; km: number }[] = [
  { id: "hatzenbach", km: 2.0 },
  { id: "flugplatz", km: 3.2 },
  { id: "fuchsroehre", km: 4.6 },
  { id: "adenauer-forst", km: 5.3 },
  { id: "wehrseifen", km: 7.7 },
  { id: "bergwerk", km: 9.2 },
  { id: "kesselchen", km: 10.7 },
  { id: "karussell", km: 12.3 },
  { id: "hohe-acht", km: 13.3 },
  { id: "bruennchen", km: 15.3 },
  { id: "pflanzgarten", km: 16.2 },
  { id: "schwalbenschwanz", km: 17.1 },
  { id: "doettinger-hoehe", km: 18.7 },
];

interface LatLon {
  lat: number;
  lon: number;
}
interface Point {
  x: number;
  z: number;
}

// --- 1. Overpass fetch + loop stitching --------------------------------------

interface OverpassNode {
  type: "node";
  id: number;
  lat: number;
  lon: number;
}
interface OverpassWay {
  type: "way";
  id: number;
  nodes: number[];
}

async function fetchCenterlineLatLon(): Promise<LatLon[]> {
  // Relation 38566 = "Nürburgring Nordschleife" (route=road) — groups the
  // per-corner ways ("Hatzenbach", "Karussell", ...) into the full lap.
  const query = `
    [out:json][timeout:60];
    relation(38566);
    way(r);
    (._;>;);
    out body;`;
  const mirrors = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
  ];
  let data: { elements: (OverpassNode | OverpassWay)[] } | null = null;
  for (const mirror of mirrors) {
    try {
      const response = await fetch(mirror, {
        method: "POST",
        body: "data=" + encodeURIComponent(query),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "need-for-sp-track-extractor/1.0 (one-time run)",
          Accept: "application/json",
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      data = (await response.json()) as { elements: (OverpassNode | OverpassWay)[] };
      console.log(`[osm] fetched from ${mirror}`);
      break;
    } catch (error) {
      console.warn(`[osm] ${mirror} failed: ${(error as Error).message}`);
      await sleep(2000);
    }
  }
  if (!data) throw new Error("all Overpass mirrors failed — try again in a minute");

  const nodes = new Map<number, OverpassNode>();
  const ways: OverpassWay[] = [];
  for (const el of data.elements) {
    if (el.type === "node") nodes.set(el.id, el);
    else if (el.type === "way") ways.push(el);
  }
  if (ways.length === 0) throw new Error("Overpass returned no Nordschleife ways");
  console.log(`[osm] ${ways.length} ways, ${nodes.size} nodes`);

  const loopNodeIds = stitchWaysIntoLoop(ways);
  return loopNodeIds.map((id) => {
    const node = nodes.get(id);
    if (!node) throw new Error(`way references missing node ${id}`);
    return { lat: node.lat, lon: node.lon };
  });
}

/** Chains ways end-to-end (reversing where needed) until the loop closes. */
function stitchWaysIntoLoop(ways: OverpassWay[]): number[] {
  const remaining = new Set(ways);
  const first = ways[0]!;
  remaining.delete(first);
  const chain = [...first.nodes];

  while (remaining.size > 0) {
    const tail = chain[chain.length - 1]!;
    let attached = false;
    for (const way of remaining) {
      const start = way.nodes[0]!;
      const end = way.nodes[way.nodes.length - 1]!;
      if (start === tail) {
        chain.push(...way.nodes.slice(1));
      } else if (end === tail) {
        chain.push(...[...way.nodes].reverse().slice(1));
      } else {
        continue;
      }
      remaining.delete(way);
      attached = true;
      break;
    }
    if (!attached) {
      throw new Error(
        `loop did not close: ${remaining.size} ways left unattached (tail node ${tail}). ` +
          "The OSM tagging may have changed — inspect the Overpass result.",
      );
    }
  }
  if (chain[0] !== chain[chain.length - 1]) {
    throw new Error("stitched chain is not a closed loop (first node != last node)");
  }
  chain.pop(); // drop the duplicated closing node
  console.log(`[osm] stitched loop: ${chain.length} nodes`);
  return chain;
}

// --- 2. Projection ------------------------------------------------------------

const METERS_PER_DEG_LAT = 111_320;

function projectToMeters(coords: LatLon[]): Point[] {
  const lat0 = coords.reduce((sum, c) => sum + c.lat, 0) / coords.length;
  const lon0 = coords.reduce((sum, c) => sum + c.lon, 0) / coords.length;
  const metersPerDegLon = METERS_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);
  return coords.map((c) => ({
    x: (c.lon - lon0) * metersPerDegLon,
    z: -(c.lat - lat0) * METERS_PER_DEG_LAT,
  }));
}

// --- 3. Elevation -------------------------------------------------------------

async function fetchElevations(coords: LatLon[]): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < coords.length; i += 100) {
    const batch = coords.slice(i, i + 100);
    const locations = batch.map((c) => `${c.lat.toFixed(6)},${c.lon.toFixed(6)}`).join("|");
    const url = `https://api.opentopodata.org/v1/eudem25m?locations=${locations}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Open Topo Data HTTP ${response.status}`);
    const data = (await response.json()) as { results: { elevation: number | null }[] };
    for (const r of data.results) {
      if (r.elevation === null) throw new Error("elevation hole in DEM — try dataset srtm30m");
      out.push(r.elevation);
    }
    console.log(`[dem] ${Math.min(i + 100, coords.length)}/${coords.length}`);
    if (i + 100 < coords.length) await sleep(1100); // API courtesy: 1 req/s
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- 4/5/6. Geometry passes ---------------------------------------------------

function arcLengths(points: Point[], closed: boolean): number[] {
  const d = [0];
  for (let i = 1; i < points.length; i++) d.push(d[i - 1]! + dist(points[i - 1]!, points[i]!));
  if (closed) d.push(d[d.length - 1]! + dist(points[points.length - 1]!, points[0]!));
  return d;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Uniform resample of a closed polyline (and any per-point scalar) at `step`. */
function resampleClosed(
  points: Point[],
  scalars: number[],
  step: number,
): { points: Point[]; scalars: number[]; length: number } {
  const cum = arcLengths(points, true);
  const total = cum[cum.length - 1]!;
  const count = Math.round(total / step);
  const outPoints: Point[] = [];
  const outScalars: number[] = [];
  let seg = 0;
  for (let i = 0; i < count; i++) {
    const target = (i / count) * total;
    while (seg < cum.length - 2 && cum[seg + 1]! < target) seg++;
    const a = points[seg % points.length]!;
    const b = points[(seg + 1) % points.length]!;
    const t = (target - cum[seg]!) / Math.max(1e-9, cum[seg + 1]! - cum[seg]!);
    outPoints.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    const sa = scalars[seg % points.length]!;
    const sb = scalars[(seg + 1) % points.length]!;
    outScalars.push(sa + (sb - sa) * t);
  }
  return { points: outPoints, scalars: outScalars, length: total };
}

/** Radius of the circumcircle through three consecutive points (Menger). */
function circumradius(a: Point, b: Point, c: Point): number {
  const ab = dist(a, b);
  const bc = dist(b, c);
  const ca = dist(c, a);
  const area2 = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x));
  if (area2 < 1e-9) return Infinity;
  return (ab * bc * ca) / (2 * area2);
}

/**
 * Iteratively smooths the neighborhoods of points whose corner radius is below
 * the floor. Radius is measured over a ±2-point baseline (10 m at the 5 m
 * resample) — single-point Menger on 5 m spacing is too noisy to converge.
 */
function clampMinRadius(points: Point[], minRadius: number): Point[] {
  let current = [...points];
  const n = current.length;
  const maxIterations = 20000;
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const offending = new Set<number>();
    for (let i = 0; i < n; i++) {
      const r = circumradius(current[(i - 2 + n) % n]!, current[i]!, current[(i + 2) % n]!);
      if (r < minRadius) {
        for (let k = -4; k <= 4; k++) offending.add((i + k + n) % n);
      }
    }
    if (offending.size === 0) {
      console.log(`[radius] clamped to >= ${minRadius} m in ${iteration} iterations`);
      return current;
    }
    if (iteration % 2000 === 0) {
      console.log(`[radius] iteration ${iteration}: ${offending.size} points offending`);
    }
    current = current.map((p, i) => {
      if (!offending.has(i)) return p;
      const prev = current[(i - 1 + n) % n]!;
      const nxt = current[(i + 1) % n]!;
      return { x: (prev.x + 2 * p.x + nxt.x) / 4, z: (prev.z + 2 * p.z + nxt.z) / 4 };
    });
  }
  console.warn(`[radius] did not fully converge in ${maxIterations} iterations — check the output`);
  return current;
}

function minCornerRadius(points: Point[]): number {
  const n = points.length;
  let worst = Infinity;
  for (let i = 0; i < n; i++) {
    const r = circumradius(points[(i - 2 + n) % n]!, points[i]!, points[(i + 2) % n]!);
    if (r < worst) worst = r;
  }
  return worst;
}

/** [1,2,1]/4 moving-average passes over a closed scalar sequence (DEM noise). */
function smoothClosedScalars(values: number[], passes: number): number[] {
  let current = [...values];
  const n = current.length;
  for (let pass = 0; pass < passes; pass++) {
    current = current.map(
      (v, i) => (current[(i - 1 + n) % n]! + 2 * v + current[(i + 1) % n]!) / 4,
    );
  }
  return current;
}

/**
 * Caps grades at maxSlope by pulling peaks down (forward+backward passes over
 * the closed profile) — short DEM artifacts otherwise exceed the real track's
 * steepest ~17%.
 */
function limitSlope(values: number[], stepMeters: number, maxSlope: number): number[] {
  const out = [...values];
  const n = out.length;
  const maxDelta = maxSlope * stepMeters;
  for (let pass = 0; pass < 50; pass++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      if (out[next]! > out[i]! + maxDelta) {
        out[next] = out[i]! + maxDelta;
        changed = true;
      }
    }
    for (let i = n - 1; i >= 0; i--) {
      const prev = (i - 1 + n) % n;
      if (out[prev]! > out[i]! + maxDelta) {
        out[prev] = out[i]! + maxDelta;
        changed = true;
      }
    }
    if (!changed) return out;
  }
  return out;
}

/** Douglas-Peucker-ish 1D simplification of the elevation profile. */
function simplifyProfile(
  profile: { atMeters: number; yMeters: number }[],
  tolerance: number,
): { atMeters: number; yMeters: number }[] {
  if (profile.length <= 2) return profile;
  const keep = new Array<boolean>(profile.length).fill(false);
  keep[0] = keep[profile.length - 1] = true;
  const stack: [number, number][] = [[0, profile.length - 1]];
  while (stack.length > 0) {
    const [lo, hi] = stack.pop()!;
    const a = profile[lo]!;
    const b = profile[hi]!;
    let worst = 0;
    let worstIndex = -1;
    for (let i = lo + 1; i < hi; i++) {
      const p = profile[i]!;
      const t = (p.atMeters - a.atMeters) / Math.max(1e-9, b.atMeters - a.atMeters);
      const err = Math.abs(p.yMeters - (a.yMeters + (b.yMeters - a.yMeters) * t));
      if (err > worst) {
        worst = err;
        worstIndex = i;
      }
    }
    if (worst > tolerance && worstIndex > 0) {
      keep[worstIndex] = true;
      stack.push([lo, worstIndex], [worstIndex, hi]);
    }
  }
  return profile.filter((_, i) => keep[i]);
}

// --- Main ---------------------------------------------------------------------

// Raw OSM/DEM data is cached beside the script so geometry passes can be
// iterated without re-fetching (delete the file to force a refresh).
const cachePath = join(dirname(fileURLToPath(import.meta.url)), ".nordschleife-cache.json");
let coords: LatLon[];
let rawElevations: number[];
if (existsSync(cachePath)) {
  const cached = JSON.parse(readFileSync(cachePath, "utf8")) as {
    coords: LatLon[];
    elevations: number[];
  };
  coords = cached.coords;
  rawElevations = cached.elevations;
  console.log(`[cache] using ${cachePath}`);
} else {
  coords = await fetchCenterlineLatLon();
  rawElevations = await fetchElevations(coords);
  writeFileSync(cachePath, JSON.stringify({ coords, elevations: rawElevations }));
}
const rawPoints = projectToMeters(coords);

// Resample raw (real-scale) loop at a uniform step so every later pass works
// on evenly spaced points.
const resampledReal = resampleClosed(rawPoints, rawElevations, 25);
console.log(`[loop] real length ${(resampledReal.length / 1000).toFixed(2)} km`);

// Rotate: start at the point nearest the castle anchor (start/finish straight).
const anchorProjected = projectToMeters([...coords, START_ANCHOR]).pop()!;
let startIndex = 0;
let best = Infinity;
resampledReal.points.forEach((p, i) => {
  const d = dist(p, anchorProjected);
  if (d < best) {
    best = d;
    startIndex = i;
  }
});
console.log(`[start] anchor is ${best.toFixed(0)} m from the loop`);
let loopPoints = rotate(resampledReal.points, startIndex);
let loopElev = rotate(resampledReal.scalars, startIndex);

// Orient: descending to Breidscheid (global min) must come before the climb to
// Hohe Acht (global max) in driving direction.
const minIndex = loopElev.indexOf(Math.min(...loopElev));
const maxIndex = loopElev.indexOf(Math.max(...loopElev));
if (minIndex > maxIndex) {
  console.log("[orient] reversing loop direction");
  loopPoints = [loopPoints[0]!, ...loopPoints.slice(1).reverse()];
  loopElev = [loopElev[0]!, ...loopElev.slice(1).reverse()];
}

function rotate<T>(items: T[], from: number): T[] {
  return [...items.slice(from), ...items.slice(0, from)];
}

// Scale XZ and elevation by the same factor — real gradients survive.
const realLength = resampledReal.length;
const scale = TARGET_LENGTH_METERS / realLength;
const minElev = Math.min(...loopElev);
let scaledPoints = loopPoints.map((p) => ({ x: p.x * scale, z: p.z * scale }));
const scaledElev = loopElev.map((y) => (y - minElev) * scale);
console.log(
  `[scale] factor ${scale.toFixed(4)} — elevation range ${(Math.max(...loopElev) - minElev).toFixed(0)} m real ` +
    `-> ${((Math.max(...loopElev) - minElev) * scale).toFixed(1)} m scaled`,
);

// Fine resample + radius clamp at game scale.
const fine = resampleClosed(scaledPoints, scaledElev, RESAMPLE_STEP_METERS);
console.log(`[radius] before clamp: min ${minCornerRadius(fine.points).toFixed(1)} m`);
const clamped = clampMinRadius(fine.points, MIN_RADIUS_METERS);
const final = resampleClosed(clamped, fine.scalars, RESAMPLE_STEP_METERS);
console.log(
  `[radius] after clamp: min ${minCornerRadius(final.points).toFixed(1)} m, ` +
    `length ${final.length.toFixed(0)} m`,
);

// Decimate path to committed control points.
const stride = Math.round(CONTROL_POINT_SPACING_METERS / RESAMPLE_STEP_METERS);
const controlPoints = final.points.filter((_, i) => i % stride === 0);

// Elevation profile keyed by FINAL arc length (normalized to the target
// length, which is what the game's distance axis uses), then de-noised,
// grade-limited to a drivable 19% and simplified.
const lengthRatio = TARGET_LENGTH_METERS / final.length;
const cleanedElev = limitSlope(
  smoothClosedScalars(final.scalars, 3),
  RESAMPLE_STEP_METERS * lengthRatio,
  0.19,
);
const fullProfile = cleanedElev.map((y, i) => ({
  atMeters: round1(i * RESAMPLE_STEP_METERS * lengthRatio),
  yMeters: round1(y),
}));
fullProfile.push({ atMeters: TARGET_LENGTH_METERS, yMeters: fullProfile[0]!.yMeters });
const elevationProfile = simplifyProfile(fullProfile, 0.6);
console.log(`[elev] profile simplified: ${fullProfile.length} -> ${elevationProfile.length} points`);

// Landmarks: km markers of the real lap mapped onto the game lap.
const landmarks = LANDMARKS_KM.map((l) => ({
  id: l.id,
  distanceMeters: Math.round((l.km / REAL_LAP_KM) * TARGET_LENGTH_METERS),
}));
for (const l of landmarks) {
  const y = elevationAtProfile(elevationProfile, l.distanceMeters);
  console.log(`[landmark] ${l.id.padEnd(18)} ${l.distanceMeters} m  (elev ${y.toFixed(1)} m)`);
}
const maxProfile = elevationProfile.reduce((a, b) => (b.yMeters > a.yMeters ? b : a));
console.log(`[sanity] highest point at ${maxProfile.atMeters} m (expect near hohe-acht)`);

function elevationAtProfile(profile: { atMeters: number; yMeters: number }[], d: number): number {
  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i]!;
    const b = profile[i + 1]!;
    if (d >= a.atMeters && d <= b.atMeters) {
      const t = (d - a.atMeters) / Math.max(1e-9, b.atMeters - a.atMeters);
      return a.yMeters + (b.yMeters - a.yMeters) * t;
    }
  }
  return profile[0]?.yMeters ?? 0;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// --- Write the data module ----------------------------------------------------

const header = `/**
 * Nürburgring Nordschleife centerline — GENERATED by scripts/extractNordschleife.ts,
 * do not edit by hand (re-run the script instead).
 *
 * Source: OpenStreetMap (© OpenStreetMap contributors, ODbL — see CREDITS.md),
 * elevation from EU-DEM 25m via Open Topo Data.
 * Faithful shape at ~1/4 linear scale: ${(realLength / 1000).toFixed(2)} km real -> ${TARGET_LENGTH_METERS / 1000} km,
 * elevation scaled by the same factor (real gradients preserved),
 * minimum corner radius clamped to ${MIN_RADIUS_METERS} m so the road ribbon never folds.
 */
`;

const pathLines = controlPoints
  .map((p) => `  { x: ${round1(p.x)}, z: ${round1(p.z)} },`)
  .join("\n");
const elevLines = elevationProfile
  .map((p) => `  { atMeters: ${p.atMeters}, yMeters: ${p.yMeters} },`)
  .join("\n");
const landmarkLines = landmarks
  .map((l) => `  { id: "${l.id}", distanceMeters: ${l.distanceMeters} },`)
  .join("\n");

const module = `${header}
export const NORDSCHLEIFE_PATH: readonly { x: number; z: number }[] = [
${pathLines}
];

export const NORDSCHLEIFE_ELEVATION: readonly { atMeters: number; yMeters: number }[] = [
${elevLines}
];

/** Famous corners mapped to game-lap distances (checkpoint candidates). */
export const NORDSCHLEIFE_LANDMARKS: readonly { id: string; distanceMeters: number }[] = [
${landmarkLines}
];
`;

const outPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "content",
  "tracks",
  "nordschleifeData.ts",
);
writeFileSync(outPath, module);
console.log(`[done] wrote ${outPath} (${controlPoints.length} path points)`);
