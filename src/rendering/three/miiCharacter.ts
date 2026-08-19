import * as THREE from "three";

/**
 * A single Mii-style character for close-up use (the youtuber standing on the
 * menu showcase platform): same design language as the finish-line crowd —
 * capsule body, ball head, hair cap, floating hands — but human-sized, with
 * eyes, and with hands exposed for a waving animation. The crowd keeps its own
 * lighter-weight builder (shared geometry across 72 people); this one is
 * per-character since only one or two ever exist at a time.
 */

export interface MiiLook {
  readonly shirtColor: string;
  readonly skinTone: string;
  readonly hairColor: string;
  /** Facial hair, for youtubers who wear one. */
  readonly beardColor?: string;
  /** Baseball cap worn over the hair. */
  readonly capColor?: string;
}

export interface MiiCharacter {
  readonly group: THREE.Group;
  readonly leftHand: THREE.Mesh;
  readonly rightHand: THREE.Mesh;
}

export function buildMiiCharacter(look: MiiLook): MiiCharacter {
  const group = new THREE.Group();

  const shirt = new THREE.MeshStandardMaterial({
    color: new THREE.Color(look.shirtColor),
    roughness: 0.8,
  });
  const skin = new THREE.MeshStandardMaterial({
    color: new THREE.Color(look.skinTone),
    roughness: 0.75,
  });
  const hair = new THREE.MeshStandardMaterial({
    color: new THREE.Color(look.hairColor),
    roughness: 0.85,
  });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2b2f38, roughness: 0.85 });

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.3, 0.28), pants);
  legs.position.y = 0.2;
  group.add(legs);

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.5, 6, 14), shirt);
  body.position.y = 0.78;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 18, 14), skin);
  head.position.y = 1.44;
  group.add(head);

  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.285, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
    hair,
  );
  hairCap.position.y = 1.48;
  group.add(hairCap);

  // Real-life traits beyond the plain Wii look: cap and beard.
  if (look.capColor) {
    const capMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(look.capColor),
      roughness: 0.85,
    });
    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(0.295, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.45),
      capMaterial,
    );
    crown.position.y = 1.5;
    group.add(crown);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.22), capMaterial);
    brim.position.set(0, 1.58, -0.31);
    brim.rotation.x = 0.12;
    group.add(brim);
  }
  if (look.beardColor) {
    const beard = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 14, 10),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(look.beardColor), roughness: 0.9 }),
    );
    beard.scale.set(1.45, 0.75, 0.9);
    beard.position.set(0, 1.33, -0.13);
    group.add(beard);
  }

  // Simple Mii eyes on the -Z (forward) face of the head.
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x1a1c22 });
  const eyeGeometry = new THREE.SphereGeometry(0.028, 8, 8);
  for (const side of [-0.095, 0.095]) {
    const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    eye.position.set(side, 1.46, -0.245);
    group.add(eye);
  }

  const handGeometry = new THREE.SphereGeometry(0.09, 10, 10);
  const leftHand = new THREE.Mesh(handGeometry, skin);
  leftHand.position.set(-0.46, 0.95, 0);
  group.add(leftHand);
  const rightHand = new THREE.Mesh(handGeometry, skin);
  rightHand.position.set(0.46, 0.95, 0);
  group.add(rightHand);

  return { group, leftHand, rightHand };
}

/**
 * Friendly idle: gentle bob and the right hand waving hello. Call every frame
 * with a clock in seconds.
 */
export function animateMiiWave(character: MiiCharacter, timeSeconds: number): void {
  character.group.position.y = Math.abs(Math.sin(timeSeconds * 2.2)) * 0.05;
  const wave = Math.sin(timeSeconds * 6);
  character.rightHand.position.set(0.46 + wave * 0.07, 1.5 + Math.abs(wave) * 0.12, -0.05);
  character.leftHand.position.set(-0.46, 0.95 + Math.sin(timeSeconds * 2.2) * 0.03, 0);
}

export function disposeMiiCharacter(character: MiiCharacter): void {
  character.group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) material.dispose();
    }
  });
}
