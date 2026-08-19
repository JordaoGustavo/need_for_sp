import * as THREE from "three";

/**
 * Mii-style celebration crowd for the finish area: little characters with a
 * rounded body, ball head, hair cap and floating hands (no arms — pure Wii),
 * jumping and waving. Geometry/materials are shared across everyone; each
 * person only gets their own group transform and animation phase.
 */

export interface CrowdPerson {
  readonly group: THREE.Group;
  readonly leftHand: THREE.Mesh;
  readonly rightHand: THREE.Mesh;
  readonly phase: number;
  readonly jumpSpeed: number;
  /** gallery = cheering at the rails; running = sprinting to the car; mob = celebrating around it. */
  mode: "gallery" | "running" | "mob";
  targetX: number;
  targetZ: number;
  /** Point to face once arrived (the car they are mobbing). */
  faceX: number;
  faceZ: number;
  runSpeed: number;
}

export interface Crowd {
  readonly group: THREE.Group;
  readonly people: CrowdPerson[];
}

const SHIRT_COLORS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0xa569bd, 0xff8c42, 0x1abc9c, 0xf06292];
const SKIN_TONES = [0xffd3b6, 0xe8b98a, 0xc68642, 0x8d5524];
const HAIR_COLORS = [0x2c1b10, 0x0e0e10, 0x6b4423, 0xd8b04a, 0x8a8d93];

interface SharedAssets {
  readonly body: THREE.CapsuleGeometry;
  readonly legs: THREE.BoxGeometry;
  readonly head: THREE.SphereGeometry;
  readonly hair: THREE.SphereGeometry;
  readonly hand: THREE.SphereGeometry;
  readonly shirtMaterials: THREE.MeshStandardMaterial[];
  readonly skinMaterials: THREE.MeshStandardMaterial[];
  readonly hairMaterials: THREE.MeshStandardMaterial[];
  readonly legsMaterial: THREE.MeshStandardMaterial;
}

function buildSharedAssets(): SharedAssets {
  // A touch of self-emission keeps the little guys readable in the night scene.
  const toMaterials = (colors: number[]) =>
    colors.map(
      (color) =>
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.8,
          emissive: color,
          emissiveIntensity: 0.22,
        }),
    );
  return {
    body: new THREE.CapsuleGeometry(0.15, 0.24, 4, 10),
    legs: new THREE.BoxGeometry(0.22, 0.14, 0.14),
    head: new THREE.SphereGeometry(0.135, 12, 10),
    // Hair: a slightly larger half-sphere cap sitting on the head.
    hair: new THREE.SphereGeometry(0.142, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
    hand: new THREE.SphereGeometry(0.05, 8, 8),
    shirtMaterials: toMaterials(SHIRT_COLORS),
    skinMaterials: toMaterials(SKIN_TONES),
    hairMaterials: toMaterials(HAIR_COLORS),
    legsMaterial: new THREE.MeshStandardMaterial({ color: 0x2b2f38, roughness: 0.85 }),
  };
}

function buildPerson(assets: SharedAssets, random: () => number): CrowdPerson {
  const group = new THREE.Group();
  const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)]!;

  const shirt = pick(assets.shirtMaterials);
  const skin = pick(assets.skinMaterials);

  const legs = new THREE.Mesh(assets.legs, assets.legsMaterial);
  legs.position.y = 0.09;
  group.add(legs);

  const body = new THREE.Mesh(assets.body, shirt);
  body.position.y = 0.36;
  group.add(body);

  const head = new THREE.Mesh(assets.head, skin);
  head.position.y = 0.68;
  group.add(head);

  const hair = new THREE.Mesh(assets.hair, pick(assets.hairMaterials));
  hair.position.y = 0.7;
  group.add(hair);

  // Floating Mii hands, ready to be thrown in the air.
  const leftHand = new THREE.Mesh(assets.hand, skin);
  leftHand.position.set(-0.24, 0.45, 0);
  group.add(leftHand);
  const rightHand = new THREE.Mesh(assets.hand, skin);
  rightHand.position.set(0.24, 0.45, 0);
  group.add(rightHand);

  return {
    group,
    leftHand,
    rightHand,
    phase: random() * Math.PI * 2,
    jumpSpeed: 3.2 + random() * 2.4,
    mode: "gallery",
    targetX: 0,
    targetZ: 0,
    faceX: 0,
    faceZ: 0,
    runSpeed: 3.4 + random() * 2.2,
  };
}

/**
 * Builds the crowd around the finish area: lines along both sides of the
 * strip from just before the line into the runoff, plus an arc behind the
 * end barrier — everyone facing the track.
 */
export function buildCrowd(
  random: () => number,
  trackLengthMeters: number,
  trackWidthMeters: number,
  runoffMeters: number,
): Crowd {
  const assets = buildSharedAssets();
  const group = new THREE.Group();
  const people: CrowdPerson[] = [];

  const addPerson = (x: number, distanceMeters: number, faceTowardsX: number): void => {
    const person = buildPerson(assets, random);
    person.group.position.set(x, 0, -distanceMeters);
    person.group.rotation.y = Math.atan2(faceTowardsX - x, 0.0001) + (random() - 0.5) * 0.5;
    group.add(person.group);
    people.push(person);
  };

  // Everyone lines the SIDES of the strip (never behind the crash wall),
  // packed right behind the guard rails so the driver actually sees them:
  // galleries flanking the last stretch, the finish line and the runoff.
  const sideX = trackWidthMeters / 2 + 1.6;
  for (let i = 0; i < 72; i++) {
    const distance = trackLengthMeters - 50 + random() * (50 + runoffMeters - 6);
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * (sideX + random() * 3.2);
    addPerson(x, distance, 0);
  }

  return { group, people };
}

/**
 * Once the winner's car has stopped, the whole crowd storms the track and
 * forms a celebrating ring around it. Targets are spread on random radii so
 * they mob the car without piling into one spot.
 */
export function sendCrowdToCar(
  people: readonly CrowdPerson[],
  carX: number,
  carZ: number,
  random: () => number,
): void {
  for (const person of people) {
    const angle = random() * Math.PI * 2;
    const radius = 2.8 + random() * 3.4;
    person.targetX = carX + Math.cos(angle) * radius;
    person.targetZ = carZ + Math.sin(angle) * radius;
    person.faceX = carX;
    person.faceZ = carZ;
    person.mode = "running";
  }
}

/** Call every frame: cheering at the rails, sprinting to the car, or mobbing it. */
export function animateCrowd(
  people: readonly CrowdPerson[],
  timeSeconds: number,
  dtSeconds: number,
): void {
  for (const person of people) {
    if (person.mode === "running") {
      const dx = person.targetX - person.group.position.x;
      const dz = person.targetZ - person.group.position.z;
      const remaining = Math.hypot(dx, dz);
      if (remaining < 0.25) {
        person.mode = "mob";
        person.group.rotation.y = Math.atan2(
          person.faceX - person.group.position.x,
          person.faceZ - person.group.position.z,
        );
      } else {
        const step = Math.min(remaining, person.runSpeed * dtSeconds);
        person.group.position.x += (dx / remaining) * step;
        person.group.position.z += (dz / remaining) * step;
        person.group.rotation.y = Math.atan2(dx, dz);
        // Skittering little run-hops instead of the big celebration jumps.
        person.group.position.y = Math.abs(Math.sin(timeSeconds * 11 + person.phase)) * 0.1;
        continue;
      }
    }

    const energy = person.mode === "mob" ? 0.36 : 0.28;
    const beat = Math.sin(timeSeconds * person.jumpSpeed + person.phase);
    person.group.position.y = Math.max(0, beat) * energy;
    const wave = Math.abs(Math.sin(timeSeconds * person.jumpSpeed * 0.5 + person.phase));
    person.leftHand.position.y = 0.45 + wave * 0.42;
    person.rightHand.position.y = 0.45 + (1 - wave) * 0.42;
  }
}

export function disposeCrowd(crowd: Crowd): void {
  const seen = new Set<THREE.BufferGeometry | THREE.Material>();
  crowd.group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      if (!seen.has(child.geometry)) {
        seen.add(child.geometry);
        child.geometry.dispose();
      }
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (!seen.has(material)) {
          seen.add(material);
          material.dispose();
        }
      }
    }
  });
}
