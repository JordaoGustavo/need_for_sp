import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { CarDefinition } from "../../domain/car";
import { buildCarMesh, disposeCarMesh } from "../../rendering/three/carMesh";
import {
  animateMiiWave,
  buildMiiCharacter,
  disposeMiiCharacter,
  type MiiCharacter,
  type MiiLook,
} from "../../rendering/three/miiCharacter";
import { playPlatformDock, playPlatformSlide } from "../../audio/mechSounds";

export interface CarPreview {
  readonly element: HTMLElement;
  /** Swaps the showcase to this car (and optional host character) via the platform animation. */
  setCar(car: CarDefinition, host?: MiiLook | null): void;
  dispose(): void;
}

const SWAP_SECONDS = 0.8;
const SETTLE_SECONDS = 0.3;
/** How far a platform travels to leave/enter the stage, in meters. */
const SLIDE_DISTANCE = 13;

interface PlatformRig {
  readonly group: THREE.Group;
  readonly car: THREE.Group;
  readonly turntable: THREE.Mesh;
  readonly definition: CarDefinition;
  readonly host: MiiCharacter | null;
  readonly hostLook: MiiLook | null;
}

interface PendingSwap {
  readonly car: CarDefinition;
  readonly host: MiiLook | null;
}

type SwapPhase =
  | { kind: "idle" }
  | { kind: "swap"; elapsed: number; outgoing: PlatformRig }
  | { kind: "settle"; elapsed: number };

/**
 * NFSU2-style garage showcase. The car idles rotating on a lit platform —
 * optionally with the youtuber's Mii-style character standing beside it,
 * waving. Swapping moves THE PLATFORMS, not the cars: the current base slides
 * off carrying its car (and host), the new base slides in from the other side
 * and locks into place with a metal clank (see the NFSU2 car-select carousel).
 */
export function createCarPreview(initialCar: CarDefinition, initialHost?: MiiLook | null): CarPreview {
  const element = document.createElement("div");
  element.className = "car-preview-3d";

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  element.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
  camera.position.set(4.2, 2.2, -5.2);
  camera.lookAt(0, 0.6, 0);

  // Environment reflections are what make the clearcoat paint and chrome read
  // as NFSU2-glossy instead of flat plastic.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight(0x40507a, 0x0a0c12, 1.1));
  const keyLight = new THREE.SpotLight(0xffffff, 60, 30, Math.PI / 5, 0.5);
  keyLight.position.set(4, 7, 4);
  scene.add(keyLight);
  const rimLight = new THREE.SpotLight(0x1fa2ff, 30, 30, Math.PI / 4, 0.6);
  rimLight.position.set(-5, 4, -4);
  scene.add(rimLight);

  let rig = buildPlatform(initialCar, initialHost ?? null);
  scene.add(rig.group);

  let phase: SwapPhase = { kind: "idle" };
  let pending: PendingSwap | null = null;

  function buildPlatform(car: CarDefinition, hostLook: MiiLook | null): PlatformRig {
    const group = new THREE.Group();
    const turntable = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.4, 0.12, 48),
      new THREE.MeshStandardMaterial({ color: 0x141821, metalness: 0.4, roughness: 0.5 }),
    );
    turntable.position.y = -0.06;
    const carMesh = buildCarMesh(car.visual);
    group.add(turntable, carMesh);

    let host: MiiCharacter | null = null;
    if (hostLook) {
      host = buildMiiCharacter(hostLook);
      // Standing at the platform's edge beside the car — clear of the car's
      // spin radius and framed to the side of it, never in front.
      host.group.position.set(2.35, 0, 1.35);
      host.group.rotation.y = Math.atan2(camera.position.x - 2.35, camera.position.z - 1.35);
      group.add(host.group);
    }

    return { group, car: carMesh, turntable, definition: car, host, hostLook };
  }

  function disposePlatform(platform: PlatformRig): void {
    scene.remove(platform.group);
    disposeCarMesh(platform.car);
    if (platform.host) disposeMiiCharacter(platform.host);
    platform.turntable.geometry.dispose();
    (platform.turntable.material as THREE.Material).dispose();
  }

  function beginSwap(swap: PendingSwap): void {
    const outgoing = rig;
    rig = buildPlatform(swap.car, swap.host);
    // Keep the showcase angle continuous: the new car arrives already posed.
    rig.car.rotation.y = outgoing.car.rotation.y;
    rig.group.position.x = -SLIDE_DISTANCE;
    scene.add(rig.group);
    phase = { kind: "swap", elapsed: 0, outgoing };
    playPlatformSlide(SWAP_SECONDS);
  }

  function sameShowcase(car: CarDefinition, host: MiiLook | null): boolean {
    return car.id === rig.definition.id && looksEqual(host, rig.hostLook);
  }

  function animatePhase(dt: number, timeSeconds: number): void {
    // The car keeps its slow showcase spin even while the platform moves.
    rig.car.rotation.y += 0.007;
    if (rig.host) animateMiiWave(rig.host, timeSeconds);

    switch (phase.kind) {
      case "idle":
        return;

      case "swap": {
        phase.elapsed += dt;
        const t = Math.min(1, phase.elapsed / SWAP_SECONDS);
        const eased = easeInOutQuad(t);
        phase.outgoing.car.rotation.y += 0.007;
        phase.outgoing.group.position.x = eased * SLIDE_DISTANCE;
        rig.group.position.x = -SLIDE_DISTANCE * (1 - eased);
        if (t >= 1) {
          disposePlatform(phase.outgoing);
          rig.group.position.x = 0;
          playPlatformDock();
          phase = { kind: "settle", elapsed: 0 };
        }
        return;
      }

      case "settle": {
        phase.elapsed += dt;
        const t = Math.min(1, phase.elapsed / SETTLE_SECONDS);
        // Damped vertical shudder: the heavy platform locking into its seat.
        rig.group.position.y = -0.06 * Math.exp(-5 * t) * Math.cos(t * Math.PI * 5);
        if (t >= 1) {
          rig.group.position.y = 0;
          if (pending) {
            const next = pending;
            pending = null;
            beginSwap(next);
          } else {
            phase = { kind: "idle" };
          }
        }
        return;
      }
    }
  }

  let disposed = false;
  let frameId = 0;
  let lastMs: number | null = null;
  function animate(nowMs: number): void {
    if (disposed) return;
    const dt = lastMs === null ? 0 : Math.min(0.05, (nowMs - lastMs) / 1000);
    lastMs = nowMs;

    animatePhase(dt, nowMs / 1000);

    const width = element.clientWidth;
    const height = element.clientHeight;
    if (width > 0 && height > 0) {
      const canvas = renderer.domElement;
      if (canvas.width !== width || canvas.height !== height) {
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }
      renderer.render(scene, camera);
    }
    frameId = requestAnimationFrame(animate);
  }
  frameId = requestAnimationFrame(animate);

  return {
    element,
    setCar(car: CarDefinition, host?: MiiLook | null): void {
      const nextHost = host ?? null;
      if (phase.kind === "idle") {
        if (!sameShowcase(car, nextHost)) beginSwap({ car, host: nextHost });
        return;
      }
      // Swap already running: queue the latest request; it starts after docking.
      pending = sameShowcase(car, nextHost) ? null : { car, host: nextHost };
    },
    dispose(): void {
      disposed = true;
      cancelAnimationFrame(frameId);
      if (phase.kind === "swap") disposePlatform(phase.outgoing);
      disposePlatform(rig);
      renderer.dispose();
      element.remove();
    },
  };
}

function looksEqual(a: MiiLook | null, b: MiiLook | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.shirtColor === b.shirtColor && a.skinTone === b.skinTone && a.hairColor === b.hairColor;
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
