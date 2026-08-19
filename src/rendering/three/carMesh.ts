import * as THREE from "three";
import type { BodyStyle, CarVisual } from "../../domain/car";

/**
 * Procedural tuner cars used by both the race renderer and the garage preview,
 * with one silhouette per real-world archetype (CarVisual.bodyStyle):
 * - "coupe": fastback coupe with a GT wing (the Civic),
 * - "hatch": boxy hot hatch with a roof spoiler and grille accent (the Golf),
 * - "supra": long nose, cabin set back and the tall hoop wing (the Supra Mk4).
 * Bodies are beveled extrusions of a side profile (hood, beltline, wheel
 * arches); everything derives from CarVisual data (ADR 0005) — no 3D assets.
 * The group's forward direction is -Z; dimensions are in meters.
 */

const FRONT_ARCH_Z = -1.35;
const REAR_ARCH_Z = 1.38;
const ARCH_RADIUS = 0.5;
const BOTTOM_Y = 0.14;

interface SpoilerSpec {
  readonly kind: "gt" | "roof";
  readonly wingY?: number;
  readonly postY?: number;
  readonly postHeight?: number;
}

interface BodySpec {
  /** Above-bottom silhouette, front (-z) to rear (+z), as [z, y] points. */
  readonly outline: ReadonlyArray<readonly [number, number]>;
  /** Greenhouse (tinted glass) profile, front to rear. */
  readonly glass: ReadonlyArray<readonly [number, number]>;
  /** Painted roof cap resting on the glass. */
  readonly roof: { readonly y: number; readonly z: number; readonly length: number };
  readonly spoiler: SpoilerSpec;
}

const BODY_SPECS: Record<BodyStyle, BodySpec> = {
  coupe: {
    outline: [
      [-2.05, 0.14], [-2.16, 0.32], [-2.1, 0.58], [-1.5, 0.7], [-0.6, 0.78],
      [1.5, 0.86], [2.12, 0.8], [2.16, 0.56], [2.1, 0.3], [1.98, 0.14],
    ],
    glass: [[-0.68, 0.74], [-0.05, 1.16], [0.9, 1.1], [1.6, 0.82]],
    roof: { y: 1.12, z: 0.42, length: 0.9 },
    spoiler: { kind: "gt", wingY: 1.16, postY: 0.98, postHeight: 0.34 },
  },
  hatch: {
    outline: [
      [-2.05, 0.14], [-2.16, 0.34], [-2.06, 0.6], [-1.3, 0.74], [-0.85, 0.8],
      [1.6, 0.88], [2.05, 0.86], [2.16, 0.6], [2.1, 0.32], [1.98, 0.14],
    ],
    glass: [[-0.8, 0.76], [-0.3, 1.22], [1.35, 1.18], [1.98, 0.88]],
    roof: { y: 1.19, z: 0.52, length: 1.5 },
    spoiler: { kind: "roof" },
  },
  supra: {
    outline: [
      [-2.05, 0.14], [-2.16, 0.28], [-2.12, 0.5], [-1.2, 0.62], [-0.45, 0.72],
      [1.6, 0.84], [2.1, 0.72], [2.16, 0.5], [2.08, 0.28], [1.96, 0.14],
    ],
    glass: [[-0.4, 0.7], [0.18, 1.1], [0.95, 1.06], [1.62, 0.78]],
    roof: { y: 1.05, z: 0.55, length: 0.7 },
    spoiler: { kind: "gt", wingY: 1.3, postY: 1.02, postHeight: 0.52 },
  },
  wagon: {
    // Long-roof station wagon (Opala Caravan): roof runs almost to the tail,
    // near-vertical tailgate.
    outline: [
      [-2.05, 0.14], [-2.16, 0.33], [-2.06, 0.58], [-1.3, 0.72], [-0.85, 0.78],
      [1.9, 0.84], [2.14, 0.82], [2.16, 0.58], [2.1, 0.3], [1.98, 0.14],
    ],
    glass: [[-0.8, 0.76], [-0.32, 1.18], [1.72, 1.16], [2.02, 0.84]],
    roof: { y: 1.16, z: 0.7, length: 1.9 },
    spoiler: { kind: "roof" },
  },
};

export function buildCarMesh(visual: CarVisual): THREE.Group {
  const spec = BODY_SPECS[visual.bodyStyle];
  const group = new THREE.Group();
  const color = new THREE.Color(visual.color);

  const paint = new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.75,
    roughness: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.15,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x11161f,
    metalness: 0.2,
    roughness: 0.08,
    envMapIntensity: 1.5,
  });
  const trim = new THREE.MeshStandardMaterial({ color: 0x14171d, metalness: 0.3, roughness: 0.7 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd9dee6, metalness: 0.95, roughness: 0.2 });

  group.add(buildExtrudedProfile(spec.outline, paint, 1.58, 0.09, true));
  group.add(buildExtrudedProfile(spec.glass, glass, 1.42, 0.04, false));

  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, spec.roof.length), paint);
  roof.position.set(0, spec.roof.y, spec.roof.z);
  roof.rotation.x = 0.03;
  group.add(roof);

  for (const [x, z] of [
    [-0.78, FRONT_ARCH_Z], [0.78, FRONT_ARCH_Z],
    [-0.78, REAR_ARCH_Z], [0.78, REAR_ARCH_Z],
  ] as const) {
    const wheel = buildWheel(chrome, trim);
    wheel.position.set(x, 0.33, z);
    group.add(wheel);
  }

  addAeroKit(group, trim);
  addSpoiler(group, spec.spoiler, trim, paint);
  addLights(group);
  addExhaust(group, chrome);

  if (visual.accentColor) {
    // e.g. the GTI's signature red grille stripe across the nose.
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.045, 0.06),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(visual.accentColor), roughness: 0.4 }),
    );
    stripe.position.set(0, 0.58, -2.22);
    group.add(stripe);
  }

  // NFSU2-signature underglow: an additive glow plane hugging the asphalt.
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 5.2),
    new THREE.MeshBasicMaterial({
      map: buildRadialGlowTexture(visual.color),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.03;
  group.add(glow);

  return group;
}

/** Beveled extrusion of a side profile; the body variant carves the wheel arches. */
function buildExtrudedProfile(
  points: ReadonlyArray<readonly [number, number]>,
  material: THREE.Material,
  depth: number,
  bevel: number,
  withArches: boolean,
): THREE.Mesh {
  const shape = new THREE.Shape();
  const [first, ...rest] = points;
  shape.moveTo(first![0], first![1]);
  for (const [z, y] of rest) shape.lineTo(z, y);

  if (withArches) {
    // Bottom edge, rear to front, carving both wheel arches.
    shape.lineTo(REAR_ARCH_Z + ARCH_RADIUS, BOTTOM_Y);
    shape.absarc(REAR_ARCH_Z, BOTTOM_Y, ARCH_RADIUS, 0, Math.PI, false);
    shape.lineTo(FRONT_ARCH_Z + ARCH_RADIUS, BOTTOM_Y);
    shape.absarc(FRONT_ARCH_Z, BOTTOM_Y, ARCH_RADIUS, 0, Math.PI, false);
  }
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: withArches ? 3 : 2,
    curveSegments: 10,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.rotateY(-Math.PI / 2);
  return new THREE.Mesh(geometry, material);
}

/** Tire + chrome five-spoke rim, axis along X. Named "wheel" so animations can spin it. */
function buildWheel(chrome: THREE.Material, trim: THREE.Material): THREE.Group {
  const wheel = new THREE.Group();
  wheel.name = "wheel";

  const tireGeometry = new THREE.TorusGeometry(0.25, 0.09, 10, 22);
  tireGeometry.rotateY(Math.PI / 2);
  const tire = new THREE.Mesh(
    tireGeometry,
    new THREE.MeshStandardMaterial({ color: 0x0c0e12, roughness: 0.95 }),
  );
  wheel.add(tire);

  const rimGeometry = new THREE.CylinderGeometry(0.17, 0.17, 0.16, 14);
  rimGeometry.rotateZ(Math.PI / 2);
  wheel.add(new THREE.Mesh(rimGeometry, trim));

  for (let i = 0; i < 5; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.06), chrome);
    spoke.rotation.x = (i / 5) * Math.PI * 2;
    spoke.position.x = 0.06;
    wheel.add(spoke);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 10).rotateZ(Math.PI / 2), chrome);
  hub.position.x = 0.05;
  wheel.add(hub);

  return wheel;
}

/** Front splitter and side skirts — the bodykit that sells the tuner stance. */
function addAeroKit(group: THREE.Group, trim: THREE.Material): void {
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.07, 0.3), trim);
  splitter.position.set(0, 0.11, -2.18);
  group.add(splitter);

  for (const side of [-0.84, 0.84]) {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 2.1), trim);
    skirt.position.set(side, 0.11, 0.02);
    group.add(skirt);
  }
}

function addSpoiler(
  group: THREE.Group,
  spec: SpoilerSpec,
  trim: THREE.Material,
  paint: THREE.Material,
): void {
  if (spec.kind === "roof") {
    // Hot-hatch roof lip spoiler at the top of the tailgate.
    const lip = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.05, 0.3), paint);
    lip.position.set(0, 1.16, 1.92);
    lip.rotation.x = -0.28;
    group.add(lip);
    return;
  }

  const wingY = spec.wingY ?? 1.16;
  const postY = spec.postY ?? 0.98;
  const postHeight = spec.postHeight ?? 0.34;

  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.05, 0.34), paint);
  wing.position.set(0, wingY, 2.04);
  wing.rotation.x = -0.16;
  group.add(wing);

  for (const side of [-0.55, 0.55]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, postHeight, 0.1), trim);
    post.position.set(side, postY, 2.06);
    group.add(post);

    const endPlate = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.38), trim);
    endPlate.position.set(side * (1.56 / (2 * 0.55)), wingY + 0.02, 2.03);
    endPlate.rotation.x = -0.16;
    group.add(endPlate);
  }
}

function addLights(group: THREE.Group): void {
  const headlightMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xcfe8ff,
    emissiveIntensity: 2.2,
  });
  // z pushed past the body extrusion's bevel (±0.09) so the lights sit proud
  // of the bumper faces instead of buried inside them.
  for (const side of [-0.55, 0.55]) {
    const headlight = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.08), headlightMaterial);
    headlight.position.set(side, 0.52, -2.24);
    headlight.rotation.z = side > 0 ? -0.12 : 0.12;
    group.add(headlight);
  }

  const taillightMaterial = new THREE.MeshStandardMaterial({
    color: 0xff2222,
    emissive: 0xff2020,
    emissiveIntensity: 1.8,
  });
  for (const side of [-0.52, 0.52]) {
    const taillight = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.09, 0.06), taillightMaterial);
    taillight.position.set(side, 0.68, 2.26);
    group.add(taillight);
  }
}

function addExhaust(group: THREE.Group, chrome: THREE.Material): void {
  const tipGeometry = new THREE.CylinderGeometry(0.05, 0.055, 0.16, 10);
  tipGeometry.rotateX(Math.PI / 2);
  for (const side of [-0.32, -0.44]) {
    const tip = new THREE.Mesh(tipGeometry, chrome);
    tip.position.set(side, 0.2, 2.26);
    group.add(tip);
  }
}

function buildRadialGlowTexture(color: string): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 8, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

/**
 * Applies an environment map to a car's reflective materials only. The race
 * renderer uses this instead of scene.environment so the glossy paint/chrome
 * pick up reflections without brightening the whole night scene.
 */
export function applyCarEnvironmentMap(group: THREE.Group, envMap: THREE.Texture): void {
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (material instanceof THREE.MeshStandardMaterial) {
        material.envMap = envMap;
        material.envMapIntensity = 0.8;
        material.needsUpdate = true;
      }
    }
  });
}

/** Frees geometries/materials of a mesh built by buildCarMesh. */
export function disposeCarMesh(group: THREE.Group): void {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if ("map" in material && material.map instanceof THREE.Texture) material.map.dispose();
        material.dispose();
      }
    }
  });
}
