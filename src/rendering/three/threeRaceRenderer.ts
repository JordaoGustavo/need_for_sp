import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { RaceRenderInput, RaceRenderer, RenderedCar, TimeOfDay } from "../renderer";
import type { TrackDefinition } from "../../domain/track";
import { applyCarEnvironmentMap, buildCarMesh, disposeCarMesh } from "./carMesh";
import { animateCrowd, buildCrowd, sendCrowdToCar, type CrowdPerson } from "./crowd";
import { TRACK_END_RUNOFF_METERS } from "../../physics/carPhysics";
import { createTrackPathModel, type TrackPathModel, type TrackSample } from "./trackPath";
import { ExplosionEffect } from "./explosionEffect";

const HUD_HEIGHT_FRACTION = 0.3;

/** How far the floresta terrain skirt (embankment) reaches from the centerline. */
const SKIRT_REACH_METERS = 38;

/**
 * WebGL implementation of RaceRenderer (supersedes the 2D CanvasRaceRenderer —
 * see ADR 0009). Night-time street scene with a chase camera behind the local
 * car. The HUD keeps its Canvas-2D HudSkin contract (ADR 0006) by drawing on a
 * transparent overlay canvas stacked on top of the WebGL canvas.
 *
 * World mapping: the track runs along -Z (distanceMeters d → z = -d), and
 * lateralOffsetMeters maps to +X. Car meshes face -Z at heading 0.
 */
export class ThreeRaceRenderer implements RaceRenderer {
  private readonly webgl: THREE.WebGLRenderer;
  private readonly overlayCtx: CanvasRenderingContext2D;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(62, 1, 0.1, 600);

  private width = 0;
  private height = 0;
  private readonly carEnvMap: THREE.Texture;
  private trackBuiltForId: string | null = null;
  private pathModel: TrackPathModel | null = null;
  private crowdPeople: CrowdPerson[] = [];
  private crowdMobilized = false;
  private lastFrameMs: number | null = null;
  private carMeshes: { carId: string; mesh: THREE.Group }[] = [];
  private explosion: ExplosionEffect | null = null;
  private engineBlownSeen = false;
  private disposed = false;
  // Mouse-orbit look-around: dragging adds a yaw/height offset to the chase
  // camera (see updateChaseCamera); releasing eases it back to zero.
  private orbitYaw = 0;
  private orbitLift = 0;
  private orbitDragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    // Only canvas drags orbit the camera — pointer capture here would steal
    // the pointerup from overlaid UI (e.g. the "Voltar ao menu" button),
    // swallowing its click.
    if (!(event.target instanceof HTMLCanvasElement)) return;
    this.orbitDragging = true;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.container.setPointerCapture?.(event.pointerId);
  };
  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.orbitDragging) return;
    const dx = event.clientX - this.lastPointerX;
    const dy = event.clientY - this.lastPointerY;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.orbitYaw -= dx * 0.007;
    this.orbitLift = Math.max(-2, Math.min(6, this.orbitLift + dy * 0.02));
  };
  private readonly onPointerUp = (): void => {
    this.orbitDragging = false;
  };

  constructor(
    private readonly container: HTMLElement,
    private readonly timeOfDay: TimeOfDay = "night",
  ) {
    this.webgl = new THREE.WebGLRenderer({ antialias: true });
    this.webgl.domElement.className = "race-canvas-3d";
    container.appendChild(this.webgl.domElement);

    const overlay = document.createElement("canvas");
    overlay.className = "race-canvas-overlay";
    container.appendChild(overlay);
    const ctx = overlay.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable for HUD overlay");
    this.overlayCtx = ctx;

    // Drag with the mouse to look around the car during the race.
    container.style.touchAction = "none";
    container.addEventListener("pointerdown", this.onPointerDown);
    container.addEventListener("pointermove", this.onPointerMove);
    container.addEventListener("pointerup", this.onPointerUp);
    container.addEventListener("pointercancel", this.onPointerUp);

    this.scene.background = new THREE.Color(0x05070f);
    this.scene.fog = new THREE.Fog(0x05070f, 60, 320);

    // Env map applied to CAR materials only (applyCarEnvironmentMap): setting
    // scene.environment would brighten every building and kill the night mood.
    const pmrem = new THREE.PMREMGenerator(this.webgl);
    this.carEnvMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    if (this.timeOfDay === "day") {
      this.scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x5c6a4a, 1.15));
      const sun = new THREE.DirectionalLight(0xfff2d8, 2.0);
      sun.position.set(80, 140, 60);
      this.scene.add(sun);
    } else {
      this.scene.add(new THREE.HemisphereLight(0x2a3550, 0x0a0c12, 0.9));
      const moon = new THREE.DirectionalLight(0x8fa8ff, 0.7);
      moon.position.set(40, 80, -30);
      this.scene.add(moon);
    }
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.webgl.setSize(width, height, false);
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.overlayCtx.canvas.width = width;
    this.overlayCtx.canvas.height = height;
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  renderFrame(input: RaceRenderInput): void {
    if (this.disposed) return;

    if (this.trackBuiltForId !== input.track.id) {
      this.buildTrackScene(input.track);
      this.trackBuiltForId = input.track.id;
    }

    this.syncCarMeshes(input.cars);

    const nowMs = performance.now();
    const dtSeconds = this.lastFrameMs === null ? 0 : Math.min(0.05, (nowMs - this.lastFrameMs) / 1000);
    this.lastFrameMs = nowMs;

    const localCar = input.cars.find((car) => car.isLocalPlayer) ?? input.cars[0];

    // The moment the winner's car has come to rest, the crowd storms the
    // track and surrounds it.
    if (!this.crowdMobilized && input.finished && localCar && Math.abs(localCar.state.speedKmh) < 1) {
      this.crowdMobilized = true;
      const carPose = this.pathModel!.pose(localCar.state.distanceMeters, localCar.state.lateralOffsetMeters);
      sendCrowdToCar(this.crowdPeople, carPose.x, carPose.z, seededRandom(`${input.track.id}-mob`));
    }
    animateCrowd(this.crowdPeople, nowMs / 1000, dtSeconds);

    this.updateExplosion(input, localCar, dtSeconds);

    if (localCar) this.updateChaseCamera(localCar);

    this.webgl.render(this.scene, this.camera);
    this.drawOverlay(input);
  }

  dispose(): void {
    this.disposed = true;
    this.container.removeEventListener("pointerdown", this.onPointerDown);
    this.container.removeEventListener("pointermove", this.onPointerMove);
    this.container.removeEventListener("pointerup", this.onPointerUp);
    this.container.removeEventListener("pointercancel", this.onPointerUp);
    for (const entry of this.carMeshes) disposeCarMesh(entry.mesh);
    this.explosion?.dispose();
    this.webgl.dispose();
    this.webgl.domElement.remove();
    this.overlayCtx.canvas.remove();
  }

  // --- scene construction -------------------------------------------------

  private buildTrackScene(track: TrackDefinition): void {
    this.pathModel = createTrackPathModel(track);
    this.applySceneryAtmosphere(track);

    const isCircuit = track.raceType === "circuit";
    const from = isCircuit ? 0 : -20;
    const to = isCircuit ? track.lengthMeters : track.lengthMeters + TRACK_END_RUNOFF_METERS + 20;
    const samples = this.pathModel.sample(6, from, to);

    this.addGround(track, samples);

    // Road surface + emissive edge lines (readable at night on any curve).
    const asphalt = new THREE.MeshStandardMaterial({
      map: buildTiledAsphaltTexture(),
      roughness: 0.95,
    });
    this.addRibbon(samples, 0, track.widthMeters, asphalt, 0, true);
    const half = track.widthMeters / 2;
    // Race tracks use white boundary lines; highways keep yellow/orange.
    const [leftLine, rightLine] =
      track.scenery === "autodromo" || track.scenery === "floresta"
        ? [0xf2f3f5, 0xf2f3f5]
        : [0xf2d200, 0xff5a1f];
    this.addRibbon(samples, -(half - 0.25), 0.3, new THREE.MeshBasicMaterial({ color: leftLine }), 0.012);
    this.addRibbon(samples, half - 0.25, 0.3, new THREE.MeshBasicMaterial({ color: rightLine }), 0.012);
    this.addCenterDashes(track, from + 8, to - 8);

    if (isCircuit) {
      this.addCheckerStripe(track, 0);
      this.addGantry(track, 0, false);
    } else {
      this.addCheckerStripe(track, 0);
      this.addCheckerStripe(track, track.lengthMeters);
      this.addGantry(track, track.lengthMeters, true);
      this.addGuardRails(track, samples);
      this.addEndWall(track);

      const crowd = buildCrowd(
        seededRandom(`${track.id}-crowd`),
        (d, lat) => this.pathModel!.pose(d, lat),
        track.lengthMeters,
        track.widthMeters,
        TRACK_END_RUNOFF_METERS,
      );
      this.scene.add(crowd.group);
      this.crowdPeople = crowd.people;

      // Floodlights over the finish area so the celebration is actually lit.
      for (const distance of [track.lengthMeters + 5, track.lengthMeters + TRACK_END_RUNOFF_METERS * 0.6]) {
        const pose = this.pathModel.pose(distance, 0);
        const flood = new THREE.PointLight(0xfff0cc, 60, 55, 1.6);
        flood.position.set(pose.x, pose.y + 9, pose.z);
        this.scene.add(flood);
      }
    }

    // Race tracks have floodlight towers, not street poles; the Nordschleife
    // famously has neither.
    if (track.scenery !== "autodromo" && track.scenery !== "floresta") {
      this.addStreetLights(track, from, to);
    }
    this.addScenery(track, samples);
    this.addTunnels(track);
    // Floresta owns its elevation via a terrain skirt (addFloresta) — pillars
    // under an entire hillside track would look like a 5 km viaduct.
    if (track.scenery !== "floresta") {
      this.addViaductSupports(track, samples);
    }
  }

  /**
   * Where the road runs high above the ground (and outside tunnels), it is a
   * viaduct: concrete pillar pairs march down to the forest floor, SP-160
   * style.
   */
  private addViaductSupports(track: TrackDefinition, samples: readonly TrackSample[]): void {
    const pillarMaterial = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.85 });
    for (let i = 0; i < samples.length; i += 4) {
      const s = samples[i]!;
      if (s.y < 6) continue;
      if (this.isInsideTunnel(track, s.d, 8)) continue;
      for (const side of [-1, 1]) {
        const offset = side * (track.widthMeters / 2 - 2.2);
        const pillar = new THREE.Mesh(
          new THREE.CylinderGeometry(1.3, 1.5, s.y + 2, 10),
          pillarMaterial,
        );
        // Top sits just under the deck so it never pokes through the asphalt.
        pillar.position.set(s.x + s.nx * offset, (s.y + 2) / 2 - 2.4, s.z + s.nz * offset);
        this.scene.add(pillar);
      }
    }
  }

  /** Sky/fog per scenery AND time of day: city glow, open highway, serra mist. */
  private applySceneryAtmosphere(track: TrackDefinition): void {
    const day = this.timeOfDay === "day";
    let sky: number;
    let near: number;
    let far: number;
    switch (track.scenery) {
      case "serra":
        [sky, near, far] = day ? [0xa8c6b3, 90, 520] : [0x04100a, 40, 230];
        break;
      case "highway":
        [sky, near, far] = day ? [0x9fc0e0, 160, 950] : [0x05070d, 70, 380];
        break;
      case "autodromo":
        [sky, near, far] = day ? [0x9fc4e8, 220, 1200] : [0x05070f, 70, 380];
        break;
      case "floresta":
        // Eifel mist hanging over the Green Hell.
        [sky, near, far] = day ? [0xa9c8b8, 110, 560] : [0x050d08, 45, 250];
        break;
      default:
        [sky, near, far] = day ? [0x9fc0e0, 150, 900] : [0x05070f, 60, 320];
    }
    this.scene.background = new THREE.Color(sky);
    this.scene.fog = new THREE.Fog(sky, near, far);
  }

  private addGround(track: TrackDefinition, samples: readonly TrackSample[]): void {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const s of samples) {
      minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
      minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z);
    }
    const margin = 320;
    const day = this.timeOfDay === "day";
    const color =
      track.scenery === "serra"
        ? day
          ? 0x2e5c26
          : 0x08130a
        : track.scenery === "highway"
          ? day
            ? 0x55663f
            : 0x0b100c
          : track.scenery === "autodromo"
            ? day
              ? 0x3f7a2e // Interlagos daytime grass
              : 0x101f0a
            : track.scenery === "floresta"
              ? day
                ? 0x2a5222 // Eifel forest floor
                : 0x071008
              : day
                ? 0x3c4046
                : 0x0a0d13;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(maxX - minX + margin * 2, maxZ - minZ + margin * 2),
      new THREE.MeshStandardMaterial({ color, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set((minX + maxX) / 2, -0.02, (minZ + maxZ) / 2);
    this.scene.add(ground);
  }

  /** Flat quad-strip following the centerline at a lateral offset. */
  private addRibbon(
    samples: readonly TrackSample[],
    offsetMeters: number,
    widthMeters: number,
    material: THREE.Material,
    y: number,
    withUvs = false,
  ): void {
    const positions: number[] = [];
    const uvs: number[] = [];
    for (const s of samples) {
      const cx = s.x + s.nx * offsetMeters;
      const cz = s.z + s.nz * offsetMeters;
      positions.push(cx - s.nx * (widthMeters / 2), s.y + y, cz - s.nz * (widthMeters / 2));
      positions.push(cx + s.nx * (widthMeters / 2), s.y + y, cz + s.nz * (widthMeters / 2));
      uvs.push(0, s.d / 6, widthMeters / 6, s.d / 6);
    }
    const indices: number[] = [];
    for (let i = 0; i < samples.length - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    if (withUvs) geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    this.scene.add(new THREE.Mesh(geometry, material));
  }

  /** Vertical quad-strip (barriers, tunnel walls) between y0 and y1. */
  private addWallRibbon(
    samples: readonly TrackSample[],
    offsetMeters: number,
    y0: number,
    y1: number,
    material: THREE.Material,
  ): void {
    const positions: number[] = [];
    for (const s of samples) {
      const cx = s.x + s.nx * offsetMeters;
      const cz = s.z + s.nz * offsetMeters;
      positions.push(cx, s.y + y0, cz);
      positions.push(cx, s.y + y1, cz);
    }
    const indices: number[] = [];
    for (let i = 0; i < samples.length - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    this.scene.add(new THREE.Mesh(geometry, material));
  }

  /** Dashed lane-divider lines: (lanes - 1) rows of dashes across the width. */
  private addCenterDashes(track: TrackDefinition, fromMeters: number, toMeters: number): void {
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 });
    const geometry = new THREE.PlaneGeometry(0.25, 5);
    const lanes = Math.max(2, track.lanes ?? 2);
    const laneWidth = track.widthMeters / lanes;
    for (let lane = 1; lane < lanes; lane++) {
      const lateral = -track.widthMeters / 2 + laneWidth * lane;
      for (let d = fromMeters; d < toMeters; d += 12) {
        const pose = this.pathModel!.pose(d, lateral);
        const dash = new THREE.Mesh(geometry, material);
        // Yaw to the track direction first, then lay the plane flat on the road.
        dash.rotation.order = "YXZ";
        dash.rotation.y = -pose.forwardAngleRad;
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(pose.x, pose.y + 0.01, pose.z);
        this.scene.add(dash);
      }
    }
  }

  /** Group anchored on the path at a given distance, rotated to face along it. */
  private anchorAt(distanceMeters: number): THREE.Group {
    const pose = this.pathModel!.pose(distanceMeters, 0);
    const anchor = new THREE.Group();
    anchor.position.set(pose.x, pose.y, pose.z);
    anchor.rotation.y = -pose.forwardAngleRad;
    this.scene.add(anchor);
    return anchor;
  }

  private addCheckerStripe(track: TrackDefinition, distanceMeters: number): void {
    const anchor = this.anchorAt(distanceMeters);
    const stripe = new THREE.Mesh(
      new THREE.PlaneGeometry(track.widthMeters, 2),
      new THREE.MeshBasicMaterial({ map: buildCheckerTexture() }),
    );
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.y = 0.02;
    anchor.add(stripe);
  }

  private addGantry(track: TrackDefinition, distanceMeters: number, withBanner: boolean): void {
    const anchor = this.anchorAt(distanceMeters);
    const gantryMaterial = new THREE.MeshStandardMaterial({ color: 0x2a303c, roughness: 0.6 });
    const halfWidth = track.widthMeters / 2 + 1;
    for (const side of [-halfWidth, halfWidth]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.5), gantryMaterial);
      post.position.set(side, 3.5, 0);
      anchor.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(halfWidth * 2 + 0.5, 1.2, 0.6), gantryMaterial);
    beam.position.set(0, 7, 0);
    anchor.add(beam);
    if (withBanner) {
      const banner = new THREE.Mesh(
        new THREE.PlaneGeometry(halfWidth * 2, 1),
        new THREE.MeshBasicMaterial({ map: buildFinishBannerTexture(), transparent: true }),
      );
      banner.position.set(0, 6.2, 0.35);
      anchor.add(banner);
    }
  }

  private addGuardRails(track: TrackDefinition, samples: readonly TrackSample[]): void {
    const barrierMaterial = new THREE.MeshStandardMaterial({
      color: 0x353c48,
      roughness: 0.7,
      side: THREE.DoubleSide,
    });
    const stripeMaterial = new THREE.MeshBasicMaterial({ color: 0xff5a1f, side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      const offset = side * (track.widthMeters / 2 + 0.6);
      this.addWallRibbon(samples, offset, 0, 0.72, barrierMaterial);
      this.addWallRibbon(samples, offset, 0.72, 0.86, stripeMaterial);
    }
  }

  /** Striped crash wall + tire stacks closing off the runoff past the finish. */
  private addEndWall(track: TrackDefinition): void {
    const anchor = this.anchorAt(track.lengthMeters + TRACK_END_RUNOFF_METERS + 1.5);
    const width = track.widthMeters + 4;

    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(width, 1.4, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x353c48, roughness: 0.7 }),
    );
    wall.position.y = 0.7;
    anchor.add(wall);

    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.05, 0.3, 0.62),
      new THREE.MeshStandardMaterial({ color: 0xff5a1f, emissive: 0xff5a1f, emissiveIntensity: 0.5 }),
    );
    stripe.position.y = 1.0;
    anchor.add(stripe);

    const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x101318, roughness: 0.95 });
    const tireGeometry = new THREE.TorusGeometry(0.34, 0.14, 8, 14);
    tireGeometry.rotateX(Math.PI / 2);
    for (let x = -width / 2 + 1; x <= width / 2 - 1; x += 1.1) {
      for (let level = 0; level < 3; level++) {
        const tire = new THREE.Mesh(tireGeometry, tireMaterial);
        tire.position.set(x, 0.15 + level * 0.28, 0.85);
        anchor.add(tire);
      }
    }
  }

  private addStreetLights(track: TrackDefinition, fromMeters: number, toMeters: number): void {
    const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x1c212b, roughness: 0.6 });
    const lampMaterial = new THREE.MeshStandardMaterial({
      color: 0xffe9b8,
      emissive: 0xffd888,
      emissiveIntensity: 2.5,
    });
    const poleGeometry = new THREE.CylinderGeometry(0.12, 0.16, 7, 8);
    const armGeometry = new THREE.BoxGeometry(2.4, 0.15, 0.15);
    const lampGeometry = new THREE.BoxGeometry(0.9, 0.18, 0.5);
    const spacing = track.scenery === "serra" ? 80 : 40;

    for (let d = Math.max(20, fromMeters + 20); d < toMeters - 10; d += spacing) {
      if (this.isInsideTunnel(track, d, 12)) continue;
      const side = Math.round(d / spacing) % 2 === 0 ? -1 : 1;
      const pose = this.pathModel!.pose(d, side * (track.widthMeters / 2 + 1.6));
      const anchor = new THREE.Group();
      anchor.position.set(pose.x, pose.y, pose.z);
      anchor.rotation.y = -pose.forwardAngleRad;
      this.scene.add(anchor);

      const pole = new THREE.Mesh(poleGeometry, poleMaterial);
      pole.position.y = 3.5;
      anchor.add(pole);
      const arm = new THREE.Mesh(armGeometry, poleMaterial);
      arm.position.set(-side * 1.1, 6.9, 0);
      anchor.add(arm);
      const lamp = new THREE.Mesh(lampGeometry, lampMaterial);
      lamp.position.set(-side * 2.1, 6.8, 0);
      anchor.add(lamp);

      // Pool of light on the asphalt, faked with an additive gradient decal —
      // real PointLights at every pole would blow the light budget. Night only.
      if (this.timeOfDay === "night") {
        const pool = new THREE.Mesh(
          new THREE.PlaneGeometry(9, 9),
          new THREE.MeshBasicMaterial({
            map: lightPoolTexture(),
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            opacity: 0.35,
          }),
        );
        pool.rotation.x = -Math.PI / 2;
        pool.position.set(-side * 2.1, 0.015, 0);
        anchor.add(pool);
      }
    }
  }

  private isInsideTunnel(track: TrackDefinition, distanceMeters: number, marginMeters: number): boolean {
    return (track.tunnels ?? []).some(
      (t) => distanceMeters > t.startMeters - marginMeters && distanceMeters < t.endMeters + marginMeters,
    );
  }

  /** Surroundings per scenery: city blocks, highway warehouses+fields, or mata fechada. */
  private addScenery(track: TrackDefinition, samples: readonly TrackSample[]): void {
    const random = seededRandom(`${track.id}-scenery`);
    switch (track.scenery) {
      case "city":
        this.addCityBuildings(track, samples, random, Math.round(track.lengthMeters / 34));
        return;
      case "highway":
        // SP-348: mostly vegetation and green hills around the carriageway.
        this.addTrees(track, samples, random, Math.round(track.lengthMeters / 12), 8, 70);
        this.addMorros(track, samples, random, 10);
        this.addCityBuildings(track, samples, random, Math.round(track.lengthMeters / 300));
        return;
      case "serra":
        // Mata Atlântica pressing against the road (SP-160 style).
        this.addTrees(track, samples, random, Math.round(track.lengthMeters / 7), 3.5, 46);
        this.addMorros(track, samples, random, 12);
        return;
      case "autodromo":
        this.addAutodromo(track, samples, random);
        return;
      case "floresta":
        this.addFloresta(track, samples, random);
        return;
    }
  }

  /**
   * Nordschleife-style dressing: the road rides its real elevation profile, so
   * a terrain skirt (embankment) sweeps from the ground plane up to the
   * shoulder on both sides — no floating ribbon, no viaduct pillars. Armco
   * barriers hug the runoff edge (the physical wall the lateral clamp already
   * implies), kerbs mark the bends, and a dense instanced conifer forest
   * stands ON the embankment at road height.
   */
  private addFloresta(
    track: TrackDefinition,
    samples: readonly TrackSample[],
    random: () => number,
  ): void {
    const day = this.timeOfDay === "day";
    const half = track.widthMeters / 2;
    const runoff = track.runoffMeters ?? 0;
    const shoulder = half + runoff + 1.5;
    const skirtReach = SKIRT_REACH_METERS;

    // Grass strip over the runoff (drivable: kerb free, grass drags).
    const grass = new THREE.MeshStandardMaterial({
      color: day ? 0x35692a : 0x0d1c0e,
      roughness: 1,
    });
    this.addRibbon(samples, -(half + runoff / 2), runoff, grass, 0.006);
    this.addRibbon(samples, half + runoff / 2, runoff, grass, 0.006);

    // Terrain skirt: ground plane -> shoulder height, one mesh per side worth
    // of the whole lap (swept profile, absolute heights).
    const skirt = new THREE.MeshStandardMaterial({
      color: day ? 0x2f5c26 : 0x081408,
      roughness: 1,
      side: THREE.DoubleSide,
    });
    this.sweepProfile(
      samples,
      (s) => [
        [-skirtReach, 0],
        [-shoulder, Math.max(0, s.y - 0.3)],
        [shoulder, Math.max(0, s.y - 0.3)],
        [skirtReach, 0],
      ],
      skirt,
    );

    // Kerbs on every bend, then armco right past the runoff.
    this.addKerbs(track, samples);
    const armco = new THREE.MeshStandardMaterial({
      color: day ? 0x9aa2aa : 0x4a5058,
      roughness: 0.45,
      metalness: 0.55,
      side: THREE.DoubleSide,
    });
    this.addWallRibbon(samples, -(half + runoff + 0.9), 0, 0.75, armco);
    this.addWallRibbon(samples, half + runoff + 0.9, 0, 0.75, armco);

    this.addForestInstanced(track, samples, random, Math.round(track.lengthMeters / 6));
    this.addMorros(track, samples, random, 14);
  }

  /**
   * Same conifer look as addTrees, but as 4 InstancedMeshes (1 trunk + 3
   * foliage tones) — a 5 km forest would otherwise be ~1700 draw calls.
   * Trees stand on the terrain skirt: base height interpolates from road
   * shoulder down to the ground plane.
   */
  private addForestInstanced(
    track: TrackDefinition,
    samples: readonly TrackSample[],
    random: () => number,
    count: number,
  ): void {
    const trunkGeometry = new THREE.CylinderGeometry(0.18, 0.26, 2.2, 6);
    const foliageGeometry = new THREE.ConeGeometry(1.9, 4.4, 7);
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x2b2015, roughness: 0.95 });
    const foliageMaterials = [0x0d2d16, 0x123a1c, 0x0a2411].map(
      (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.95 }),
    );

    const edge = track.widthMeters / 2 + (track.runoffMeters ?? 0) + 2;
    const clearance = edge + 0.5;
    interface Placement {
      x: number;
      y: number;
      z: number;
      scale: number;
      tone: number;
    }
    const placements: Placement[] = [];
    for (let i = 0; i < count; i++) {
      const s = samples[Math.floor(random() * samples.length)]!;
      const side = random() < 0.5 ? -1 : 1;
      const offset = edge + random() * (SKIRT_REACH_METERS - 4 - edge);
      const x = s.x + s.nx * side * offset;
      const z = s.z + s.nz * side * offset;
      // The lap folds back on itself — never plant a tree on ANY road section.
      const clear = samples.every((o) => (o.x - x) ** 2 + (o.z - z) ** 2 > clearance ** 2);
      if (!clear) continue;
      // Down the embankment: shoulder height at the road, ground at the reach.
      const t = (offset - edge) / (SKIRT_REACH_METERS - edge);
      placements.push({
        x,
        y: Math.max(0, s.y * (1 - t)),
        z,
        scale: 0.8 + random() * 1.5,
        tone: Math.floor(random() * foliageMaterials.length),
      });
    }

    const dummy = new THREE.Object3D();
    const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, placements.length);
    placements.forEach((p, i) => {
      dummy.position.set(p.x, p.y + 1.1 * p.scale, p.z);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
    });
    this.scene.add(trunks);

    foliageMaterials.forEach((material, tone) => {
      const mine = placements.filter((p) => p.tone === tone);
      const foliage = new THREE.InstancedMesh(foliageGeometry, material, mine.length);
      mine.forEach((p, i) => {
        dummy.position.set(p.x, p.y + 4.2 * p.scale, p.z);
        dummy.scale.setScalar(p.scale);
        dummy.updateMatrix();
        foliage.setMatrixAt(i, dummy.matrix);
      });
      this.scene.add(foliage);
    });
  }

  /**
   * Interlagos-style circuit dressing: red/white kerbs in the corners, grass
   * verges, a white perimeter wall, grandstands + pit building on the main
   * straight (Setor A / Pit Stop Club side) and floodlight towers.
   */
  private addAutodromo(
    track: TrackDefinition,
    samples: readonly TrackSample[],
    random: () => number,
  ): void {
    const half = track.widthMeters / 2;
    const day = this.timeOfDay === "day";
    const runoff = track.runoffMeters ?? 6;

    // The iconic green-painted run-off apron on both sides — fully drivable
    // (kerbs are free, the physics drags speed only past the kerb strip).
    const apron = new THREE.MeshStandardMaterial({
      color: day ? 0x2f9e50 : 0x155c2e,
      roughness: 0.95,
    });
    this.addRibbon(samples, -(half + runoff / 2), runoff, apron, 0.006);
    this.addRibbon(samples, half + runoff / 2, runoff, apron, 0.006);

    // Kerbs (zebras) wherever the track actually bends.
    this.addKerbs(track, samples);

    // Green perimeter walls right past the run-off (sponsor-green, Interlagos style).
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: day ? 0x1f8f4a : 0x11552c,
      roughness: 0.8,
      side: THREE.DoubleSide,
    });
    this.addWallRibbon(samples, -(half + runoff + 1.2), 0, 1.1, wallMaterial);
    this.addWallRibbon(samples, half + runoff + 1.2, 0, 1.1, wallMaterial);

    // Main straight: grandstands on the outside, pit building on the inside.
    const standMaterial = new THREE.MeshStandardMaterial({ color: day ? 0x8f979f : 0x39414d, roughness: 0.8 });
    const seatsMaterial = new THREE.MeshStandardMaterial({
      color: 0x2b6cb0,
      emissive: 0x1a4a80,
      emissiveIntensity: day ? 0.05 : 0.25,
      roughness: 0.9,
    });
    for (let d = -80; d <= 100; d += 46) {
      const anchor = this.anchorAt(d);
      const base = new THREE.Mesh(new THREE.BoxGeometry(10, 7, 40), standMaterial);
      base.position.set(-(half + runoff + 10), 3.5, 0);
      base.rotation.z = 0.32;
      anchor.add(base);
      const seats = new THREE.Mesh(new THREE.BoxGeometry(10.2, 1.2, 40.2), seatsMaterial);
      seats.position.set(-(half + runoff + 10), 7.2, 0);
      seats.rotation.z = 0.32;
      anchor.add(seats);
    }
    const pitAnchor = this.anchorAt(20);
    const pits = new THREE.Mesh(new THREE.BoxGeometry(9, 6, 120), standMaterial);
    pits.position.set(half + runoff + 8, 3, 0);
    pitAnchor.add(pits);
    const pitGlass = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 2.2, 118),
      new THREE.MeshStandardMaterial({
        color: 0xbfd9ee,
        emissive: 0x9fc6ff,
        emissiveIntensity: day ? 0.1 : 0.6,
      }),
    );
    pitGlass.position.set(half + runoff + 3.6, 3.4, 0);
    pitAnchor.add(pitGlass);

    // Floodlight towers around the lap (lit only at night).
    const towerMaterial = new THREE.MeshStandardMaterial({ color: 0x666c76, roughness: 0.6 });
    const headMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xfff2cc,
      emissiveIntensity: day ? 0.1 : 3,
    });
    for (let d = 0; d < track.lengthMeters; d += Math.round(track.lengthMeters / 6)) {
      const side = random() < 0.5 ? -1 : 1;
      const pose = this.pathModel!.pose(d, side * (half + runoff + 3));
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 16, 8), towerMaterial);
      tower.position.set(pose.x, 8, pose.z);
      this.scene.add(tower);
      const head = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1, 0.5), headMaterial);
      head.position.set(pose.x, 16.4, pose.z);
      this.scene.add(head);
      if (!day) {
        const glow = new THREE.PointLight(0xfff0cc, 70, 90, 1.7);
        glow.position.set(pose.x, 15, pose.z);
        this.scene.add(glow);
      }
    }

    // Trees inside/around the grounds (Interlagos is full of them)...
    this.addTrees(track, samples, random, 40, runoff + 16, runoff + 90);

    // ...and the low-rise neighborhood far outside the fences, never on the grounds.
    const windowTexture = buildWindowTexture(random);
    for (let i = 0; i < 30; i++) {
      const anchor = samples[Math.floor(random() * samples.length)]!;
      const side = random() < 0.5 ? -1 : 1;
      const offset = 150 + random() * 160;
      const x = anchor.x + anchor.nx * side * offset;
      const z = anchor.z + anchor.nz * side * offset;
      const clear = samples.every((o) => (o.x - x) ** 2 + (o.z - z) ** 2 > 140 ** 2);
      if (!clear) continue;
      const h = 5 + random() * 10;
      const house = new THREE.Mesh(
        new THREE.BoxGeometry(10 + random() * 10, h, 10 + random() * 10),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color().setHSL(0.07, 0.25, day ? 0.45 : 0.09),
          emissive: 0x2b3a55,
          emissiveIntensity: day ? 0 : 0.2,
          emissiveMap: windowTexture,
          roughness: 0.9,
        }),
      );
      house.position.set(x, h / 2, z);
      this.scene.add(house);
    }
  }

  /** Red/white kerb ribbons along every bent section of the lap. */
  private addKerbs(track: TrackDefinition, samples: readonly TrackSample[]): void {
    const half = track.widthMeters / 2;
    const material = new THREE.MeshBasicMaterial({ map: buildKerbTexture() });

    let runStart: number | null = null;
    const flushRun = (endIndex: number): void => {
      if (runStart === null || endIndex - runStart < 2) {
        runStart = null;
        return;
      }
      const run = samples.slice(Math.max(0, runStart - 1), endIndex + 1);
      this.addRibbon(run, -(half + 0.55), 1.2, material, 0.015, true);
      this.addRibbon(run, half + 0.55, 1.2, material, 0.015, true);
      runStart = null;
    };

    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i]!;
      const b = samples[i + 1]!;
      const angleA = Math.atan2(a.nz, a.nx);
      const angleB = Math.atan2(b.nz, b.nx);
      let delta = angleB - angleA;
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      const curvature = Math.abs(delta) / Math.max(1, b.d - a.d);

      if (curvature > 0.01) {
        if (runStart === null) runStart = i;
      } else {
        flushRun(i);
      }
    }
    flushRun(samples.length - 1);
  }

  private addCityBuildings(
    track: TrackDefinition,
    samples: readonly TrackSample[],
    random: () => number,
    count: number,
  ): void {
    const windowTexture = buildWindowTexture(random);
    for (let i = 0; i < count; i++) {
      const s = samples[Math.floor(random() * samples.length)]!;
      const side = random() < 0.5 ? -1 : 1;
      const offset = track.widthMeters / 2 + 22 + random() * 40;
      const x = s.x + s.nx * side * offset;
      const z = s.z + s.nz * side * offset;
      // Keep blocks clear of every part of the path, not just this segment.
      const clear = samples.every((o) => (o.x - x) ** 2 + (o.z - z) ** 2 > 19 ** 2);
      if (!clear) continue;

      const buildingHeight = 10 + random() * 26;
      const building = new THREE.Mesh(
        new THREE.BoxGeometry(10 + random() * 8, buildingHeight, 10 + random() * 8),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color().setHSL(0.62, 0.15, 0.05 + random() * 0.05),
          emissive: 0x2b3a55,
          emissiveIntensity: 0.25,
          emissiveMap: windowTexture,
          roughness: 0.9,
        }),
      );
      building.position.set(x, buildingHeight / 2, z);
      this.scene.add(building);
    }
  }

  /** Big soft green hills on the horizon — the morros framing SP highways. */
  private addMorros(
    track: TrackDefinition,
    samples: readonly TrackSample[],
    random: () => number,
    count: number,
  ): void {
    const day = this.timeOfDay === "day";
    const materials = [0x1d4419, 0x25541f, 0x173a14].map(
      (color) =>
        new THREE.MeshStandardMaterial({
          color: day ? color : (color & 0xfefefe) >> 1,
          roughness: 1,
        }),
    );
    for (let i = 0; i < count; i++) {
      const s = samples[Math.floor(random() * samples.length)]!;
      const side = random() < 0.5 ? -1 : 1;
      const offset = 140 + random() * 260;
      const x = s.x + s.nx * side * offset;
      const z = s.z + s.nz * side * offset;
      const radius = 90 + random() * 150;
      const clear = samples.every((o) => (o.x - x) ** 2 + (o.z - z) ** 2 > (radius + 30) ** 2);
      if (!clear) continue;

      const height = 30 + random() * 55;
      const morro = new THREE.Mesh(
        buildHillGeometry(radius, height, random),
        materials[Math.floor(random() * materials.length)]!,
      );
      morro.position.set(x, -2, z);
      morro.rotation.y = random() * Math.PI * 2;
      this.scene.add(morro);
    }
  }

  private addTrees(
    track: TrackDefinition,
    samples: readonly TrackSample[],
    random: () => number,
    count: number,
    minOffset: number,
    maxOffset: number,
  ): void {
    const trunkGeometry = new THREE.CylinderGeometry(0.18, 0.26, 2.2, 6);
    const foliageGeometry = new THREE.ConeGeometry(1.9, 4.4, 7);
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x2b2015, roughness: 0.95 });
    const foliageMaterials = [0x0d2d16, 0x123a1c, 0x0a2411].map(
      (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.95 }),
    );
    const clearance = track.widthMeters / 2 + 2.4;

    for (let i = 0; i < count; i++) {
      const s = samples[Math.floor(random() * samples.length)]!;
      const side = random() < 0.5 ? -1 : 1;
      const offset = track.widthMeters / 2 + minOffset + random() * (maxOffset - minOffset);
      const x = s.x + s.nx * side * offset;
      const z = s.z + s.nz * side * offset;
      const clear = samples.every((o) => (o.x - x) ** 2 + (o.z - z) ** 2 > clearance ** 2);
      if (!clear) continue;

      const scale = 0.8 + random() * 1.5;
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
      trunk.position.y = 1.1;
      const foliage = new THREE.Mesh(
        foliageGeometry,
        foliageMaterials[Math.floor(random() * foliageMaterials.length)]!,
      );
      foliage.position.y = 4.2;
      tree.add(trunk, foliage);
      tree.scale.setScalar(scale);
      tree.position.set(x, 0, z);
      this.scene.add(tree);
    }
  }

  /** Tunnel sections: rock mound outside, concrete walls + lit ceiling inside. */
  /**
   * Tunnels bore through REAL mountains (SP-160 references): a smooth green
   * ridge swept along the tunnel section from the ground up over the bore,
   * hillside cut faces with a real opening at both mouths (concrete portal
   * frame + green trim), and inside a dark arched vault with spaced warm
   * light rings receding into the distance.
   */
  private addTunnels(track: TrackDefinition): void {
    for (const tunnel of track.tunnels ?? []) {
      const samples = this.pathModel!.sample(6, tunnel.startMeters, tunnel.endMeters);
      this.addTunnelVault(track, samples, tunnel.startMeters, tunnel.endMeters);
      this.addTunnelRidge(track, samples);
      this.addTunnelMouth(track, tunnel.startMeters);
      this.addTunnelMouth(track, tunnel.endMeters);
    }
  }

  /** Sweeps a cross-section profile (lateral, height-above-ground) along samples. */
  private sweepProfile(
    samples: readonly TrackSample[],
    profile: (s: TrackSample) => ReadonlyArray<readonly [number, number]>,
    material: THREE.Material,
  ): void {
    const positions: number[] = [];
    let ringSize = 0;
    for (const s of samples) {
      const ring = profile(s);
      ringSize = ring.length;
      for (const [lateral, height] of ring) {
        positions.push(s.x + s.nx * lateral, height, s.z + s.nz * lateral);
      }
    }
    const indices: number[] = [];
    for (let i = 0; i < samples.length - 1; i++) {
      for (let k = 0; k < ringSize - 1; k++) {
        const a = i * ringSize + k;
        indices.push(a, a + 1, a + ringSize, a + 1, a + ringSize + 1, a + ringSize);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    this.scene.add(new THREE.Mesh(geometry, material));
  }

  /** Arched interior: dark concrete vault + warm light rings every ~22m. */
  private addTunnelVault(
    track: TrackDefinition,
    samples: readonly TrackSample[],
    startMeters: number,
    endMeters: number,
  ): void {
    const radius = track.widthMeters / 2 + 1.0;
    const archHeight = radius * 0.62;
    const ringSegments = 10;
    const archRing = (s: TrackSample): ReadonlyArray<readonly [number, number]> => {
      const ring: (readonly [number, number])[] = [];
      for (let k = 0; k <= ringSegments; k++) {
        const theta = Math.PI - (k / ringSegments) * Math.PI;
        ring.push([Math.cos(theta) * radius, s.y + Math.sin(theta) * archHeight + 0.02] as const);
      }
      return ring;
    };

    const vault = new THREE.MeshStandardMaterial({
      color: 0x34383f,
      emissive: 0x54401f,
      emissiveIntensity: 0.16,
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
    this.sweepProfile(samples, archRing, vault);

    // Spaced glowing rings — the rows of sodium lamps receding down the bore.
    const lampMaterial = new THREE.MeshBasicMaterial({ color: 0xffd9a0, side: THREE.DoubleSide });
    const lampRadius = radius - 0.12;
    for (let d = startMeters + 10; d < endMeters - 6; d += 22) {
      const stations = [d, d + 0.7].map((dd) => {
        const pose = this.pathModel!.pose(dd, 0);
        return {
          d: dd,
          x: pose.x,
          y: pose.y,
          z: pose.z,
          nx: Math.cos(pose.forwardAngleRad),
          nz: Math.sin(pose.forwardAngleRad),
        };
      });
      const lampRing = (s: TrackSample): ReadonlyArray<readonly [number, number]> => {
        const ring: (readonly [number, number])[] = [];
        for (let k = 0; k <= ringSegments; k++) {
          const theta = Math.PI - (k / ringSegments) * Math.PI;
          ring.push([Math.cos(theta) * lampRadius, s.y + Math.sin(theta) * archHeight * 0.985 + 0.02] as const);
        }
        return ring;
      };
      this.sweepProfile(stations, lampRing, lampMaterial);
    }
  }

  /** Rounded hillside height (cosine dome) at a lateral offset from the bore. */
  private ridgeHeightAt(lateral: number, roadY: number, distanceMeters: number): number {
    const halfExtent = 46;
    // Undulating crest so the hilltop is organic, not a straight tent line.
    const crest =
      roadY + 18 + 3.2 * Math.sin(distanceMeters * 0.045) + 2.2 * Math.sin(distanceMeters * 0.019 + 1.7);
    const t = Math.min(1, Math.abs(lateral) / halfExtent);
    return crest * Math.pow(Math.cos((t * Math.PI) / 2), 1.35);
  }

  /** Smooth forested ridge from the ground up over the bore — the morro itself. */
  private addTunnelRidge(track: TrackDefinition, samples: readonly TrackSample[]): void {
    const day = this.timeOfDay === "day";
    const ridgeMaterial = new THREE.MeshStandardMaterial({
      color: day ? 0x25541f : 0x122a0f,
      roughness: 1,
    });
    const halfExtent = 46;
    const segments = 14;
    const ridgeRing = (s: TrackSample): ReadonlyArray<readonly [number, number]> => {
      const ring: (readonly [number, number])[] = [];
      for (let k = 0; k <= segments; k++) {
        const lateral = -halfExtent + (2 * halfExtent * k) / segments;
        ring.push([lateral, this.ridgeHeightAt(lateral, s.y, s.d)] as const);
      }
      return ring;
    };
    this.sweepProfile(samples, ridgeRing, ridgeMaterial);
  }

  /**
   * Hillside cut face at a tunnel mouth: the green slope with a REAL opening
   * (ShapeGeometry with a hole), fronted by the concrete portal frame with
   * the Imigrantes green trim.
   */
  private addTunnelMouth(track: TrackDefinition, distanceMeters: number): void {
    const pose = this.pathModel!.pose(distanceMeters, 0);
    const anchor = this.anchorAt(distanceMeters);
    const day = this.timeOfDay === "day";

    const halfExtent = 46;
    const openingHalf = track.widthMeters / 2 + 1.3;
    const openingHeight = 5.6;

    // Green hillside face following the ridge's rounded silhouette, with the
    // mouth punched out. Shape coords are relative to the road surface.
    const face = new THREE.Shape();
    const faceSegments = 18;
    face.moveTo(-halfExtent, -pose.y);
    for (let k = 0; k <= faceSegments; k++) {
      const lateral = -halfExtent + (2 * halfExtent * k) / faceSegments;
      face.lineTo(lateral, this.ridgeHeightAt(lateral, pose.y, distanceMeters) - pose.y);
    }
    face.lineTo(halfExtent, -pose.y);
    face.closePath();
    const mouth = new THREE.Path();
    mouth.moveTo(-openingHalf, -pose.y);
    mouth.lineTo(-openingHalf, openingHeight);
    mouth.lineTo(openingHalf, openingHeight);
    mouth.lineTo(openingHalf, -pose.y);
    mouth.closePath();
    face.holes.push(mouth);
    const hillFace = new THREE.Mesh(
      new THREE.ShapeGeometry(face),
      new THREE.MeshStandardMaterial({
        color: day ? 0x2c6124 : 0x163313,
        roughness: 1,
        side: THREE.DoubleSide,
      }),
    );
    anchor.add(hillFace);

    // Concrete portal frame hugging the opening.
    const concrete = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.9 });
    for (const side of [-1, 1]) {
      const jamb = new THREE.Mesh(new THREE.BoxGeometry(1.6, openingHeight + 1.2, 1.2), concrete);
      jamb.position.set(side * (openingHalf + 0.8), (openingHeight + 1.2) / 2, 0);
      anchor.add(jamb);
    }
    const header = new THREE.Mesh(
      new THREE.BoxGeometry(openingHalf * 2 + 3.2, 1.6, 1.2),
      concrete,
    );
    header.position.set(0, openingHeight + 0.8, 0);
    anchor.add(header);

    // Green trim ring just inside the concrete, like the Imigrantes portals.
    const trim = new THREE.MeshStandardMaterial({ color: 0x2f7d4f, roughness: 0.7 });
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, openingHeight, 1.3), trim);
      post.position.set(side * (openingHalf - 0.2), openingHeight / 2, 0);
      anchor.add(post);
    }
    const lintelTrim = new THREE.Mesh(new THREE.BoxGeometry(openingHalf * 2, 0.4, 1.3), trim);
    lintelTrim.position.set(0, openingHeight - 0.2, 0);
    anchor.add(lintelTrim);
  }

  // --- per-frame updates ----------------------------------------------------

  /**
   * NOS abuse ending: on the frame engineBlown flips true, detonate a fireball
   * on the local car's hood; afterwards the dead car trails smoke while it
   * coasts out.
   */
  private updateExplosion(
    input: RaceRenderInput,
    localCar: RenderedCar | undefined,
    dtSeconds: number,
  ): void {
    if (!input.engineBlown || !localCar) {
      this.explosion?.update(dtSeconds, null);
      return;
    }
    const pose = this.pathModel!.pose(localCar.state.distanceMeters, localCar.state.lateralOffsetMeters);
    const yaw = localCar.state.headingRad + pose.forwardAngleRad;
    // Engine bay sits ahead of the car's center (forward = (sin, -cos)).
    const hood = {
      x: pose.x + Math.sin(yaw) * 1.1,
      y: pose.y + 0.75,
      z: pose.z - Math.cos(yaw) * 1.1,
    };
    if (!this.engineBlownSeen) {
      this.engineBlownSeen = true;
      this.explosion ??= new ExplosionEffect(this.scene);
      this.explosion.trigger(hood.x, hood.y, hood.z);
    }
    this.explosion?.update(dtSeconds, hood);
  }

  private syncCarMeshes(cars: readonly RenderedCar[]): void {
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      if (!car) continue;
      let entry = this.carMeshes[i];
      if (!entry || entry.carId !== car.definition.id) {
        if (entry) {
          this.scene.remove(entry.mesh);
          disposeCarMesh(entry.mesh);
        }
        entry = { carId: car.definition.id, mesh: buildCarMesh(car.definition.visual) };
        applyCarEnvironmentMap(entry.mesh, this.carEnvMap);
        this.scene.add(entry.mesh);
        this.carMeshes[i] = entry;
      }
      const pose = this.pathModel!.pose(car.state.distanceMeters, car.state.lateralOffsetMeters);
      entry.mesh.position.set(pose.x, pose.y, pose.z);
      entry.mesh.rotation.y = -(car.state.headingRad + pose.forwardAngleRad);
    }
  }

  private updateChaseCamera(localCar: RenderedCar): void {
    const pose = this.pathModel!.pose(localCar.state.distanceMeters, localCar.state.lateralOffsetMeters);
    // World yaw = track direction at this point + the car's own heading.
    const yaw = localCar.state.headingRad + pose.forwardAngleRad;
    const speedFraction = Math.min(1, Math.abs(localCar.state.speedKmh) / 260);

    // Mouse-orbit offsets ease back to the chase position once released.
    if (!this.orbitDragging) {
      this.orbitYaw *= 0.9;
      this.orbitLift *= 0.9;
      if (Math.abs(this.orbitYaw) < 0.002) this.orbitYaw = 0;
      if (Math.abs(this.orbitLift) < 0.01) this.orbitLift = 0;
    }

    // Rigid follow, rotated with the car's world yaw so steering/reversing and
    // circuit corners keep the camera behind the car (forward = (sin, -cos)).
    const orbitedYaw = yaw + this.orbitYaw;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const orbitSin = Math.sin(orbitedYaw);
    const orbitCos = Math.cos(orbitedYaw);
    const back = 8.5 + speedFraction * 2;
    // Camera rides the road elevation (sampled slightly behind, so crests
    // and viaducts read naturally).
    const camY = this.pathModel!.pose(localCar.state.distanceMeters - back, 0).y;
    const camHeight = Math.max(camY + 1.1, camY + 3.2 + speedFraction * 0.6 + this.orbitLift);
    this.camera.position.set(pose.x - orbitSin * back, camHeight, pose.z + orbitCos * back);

    // While orbiting, look at the car itself; blended so the transition back
    // to the road-ahead framing stays smooth.
    const orbitAmount = Math.min(1, Math.abs(this.orbitYaw) / 0.4 + Math.abs(this.orbitLift) / 3);
    const lookX = pose.x + sin * 12 * (1 - orbitAmount);
    const lookY = pose.y + 1.2;
    const lookZ = pose.z - cos * 12 * (1 - orbitAmount);
    this.camera.lookAt(lookX, lookY, lookZ);
  }

  private drawOverlay(input: RaceRenderInput): void {
    const ctx = this.overlayCtx;
    const { width, height } = this;
    ctx.clearRect(0, 0, width, height);

    const hudHeight = height * HUD_HEIGHT_FRACTION;
    input.hudSkin.render(ctx, input.localPlayerHud, {
      x: 0,
      y: height - hudHeight,
      width,
      height: hudHeight,
    });

    this.drawMinimap(input);
    this.drawPositionAndTime(input);

    if (input.countdownSecondsRemaining !== null) {
      ctx.save();
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "#ff5a1f";
      ctx.shadowBlur = 30;
      ctx.font = "bold 110px 'Chakra Petch', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const label =
        input.countdownSecondsRemaining > 0 ? String(Math.ceil(input.countdownSecondsRemaining)) : "GO!";
      ctx.fillText(label, width / 2, height / 2);
      ctx.restore();
    }

    if (input.finished) {
      this.drawResultsPanel(input);
    } else if (input.raceMessage) {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.fillRect(0, height * 0.4, width, height * 0.18);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 34px 'Chakra Petch', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(input.raceMessage, width / 2, height * 0.49);
      ctx.restore();
    }
  }

  /** NFSU2-style circular minimap, bottom-left: track path + both cars. */
  private drawMinimap(input: RaceRenderInput): void {
    const ctx = this.overlayCtx;
    const radius = Math.min(this.width, this.height) * 0.11;
    const cx = radius + 26;
    const cy = this.height - radius - 26;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "rgba(10,13,18,0.6)";
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

    // Fit the real track outline (any shape) into the circle. Circuits get a
    // denser polyline — 80 samples turn the Nordschleife into mush.
    const outlineSamples = this.pathModel!.closed ? 220 : 80;
    const samples = this.pathModel!.sample(
      input.track.lengthMeters / outlineSamples,
      0,
      input.track.lengthMeters,
    );
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const s of samples) {
      minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
      minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z);
    }
    const extent = Math.max(maxX - minX, maxZ - minZ, 1);
    const scale = (radius * 1.44) / extent;
    const midX = (minX + maxX) / 2;
    const midZ = (minZ + maxZ) / 2;
    const toScreen = (x: number, z: number): readonly [number, number] =>
      [cx + (x - midX) * scale, cy + (z - midZ) * scale] as const;

    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = radius * (this.pathModel!.closed ? 0.09 : 0.14);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    samples.forEach((s, i) => {
      const [x, y] = toScreen(s.x, s.z);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Start/finish tick.
    const startPose = this.pathModel!.pose(0, 0);
    const [sx, sy] = toScreen(startPose.x, startPose.z);
    ctx.fillStyle = "#0c0e14";
    ctx.beginPath();
    ctx.arc(sx, sy, radius * 0.06, 0, Math.PI * 2);
    ctx.fill();

    for (const car of input.cars) {
      const pose = this.pathModel!.pose(car.state.distanceMeters, car.state.lateralOffsetMeters);
      const [x, y] = toScreen(pose.x, pose.z);
      this.drawMinimapArrow(
        x,
        y,
        car.isLocalPlayer ? "#39d353" : "#ff9b2f",
        radius * 0.14,
        car.state.headingRad + pose.forwardAngleRad,
      );
    }
    ctx.restore();

    // Double ring border
    ctx.strokeStyle = "rgba(215,220,230,0.85)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(30,35,45,0.9)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  private drawMinimapArrow(x: number, y: number, color: string, size: number, headingRad: number): void {
    const ctx = this.overlayCtx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(headingRad);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(-size * 0.7, size * 0.7);
    ctx.lineTo(size * 0.7, size * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** NFSU2-style standing + race clock, top-right ("1st /4" in the reference). */
  private drawPositionAndTime(input: RaceRenderInput): void {
    const ctx = this.overlayCtx;
    const localCar = input.cars.find((car) => car.isLocalPlayer);
    if (!localCar) return;

    const x = this.width - 36;
    ctx.save();
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 8;

    // Standing only makes sense with an opponent; solo shows just the clock.
    if (input.cars.length > 1) {
      const ahead = input.cars.filter(
        (car) => !car.isLocalPlayer && car.state.distanceMeters > localCar.state.distanceMeters,
      ).length;
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold italic 54px 'Chakra Petch', sans-serif";
      ctx.fillText(`${ahead + 1}º`, x - 58, 74);
      ctx.font = "bold italic 30px 'Chakra Petch', sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fillText(`/${input.cars.length}`, x, 74);
    }

    ctx.fillStyle = "#b8ff1f";
    ctx.font = "bold 26px 'Chakra Petch', monospace";
    ctx.fillText(formatRaceTime(input.raceTimeSeconds), x, 112);

    if (input.track.laps > 1) {
      const lap = Math.min(
        input.track.laps,
        Math.floor(localCar.state.distanceMeters / input.track.lengthMeters) + 1,
      );
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold italic 26px 'Chakra Petch', sans-serif";
      ctx.fillText(`VOLTA ${lap}/${input.track.laps}`, x, 148);
    }
    ctx.restore();
  }

  /** NFSU2-style results board: standings list + finish time, over a dark panel. */
  private drawResultsPanel(input: RaceRenderInput): void {
    const ctx = this.overlayCtx;
    const panelWidth = Math.min(420, this.width * 0.4);
    const panelHeight = 240;
    const x = this.width - panelWidth - 32;
    const y = this.height * 0.2;

    ctx.save();
    ctx.fillStyle = "rgba(8,10,14,0.72)";
    ctx.fillRect(x, y, panelWidth, panelHeight);
    ctx.strokeStyle = "rgba(215,220,230,0.35)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, panelWidth, panelHeight);

    const solo = input.cars.length <= 1;
    const header = input.engineBlown
      ? "MOTOR ESTOUROU!"
      : solo
        ? "CHEGADA!"
        : input.localWon === null
          ? "CHEGADA"
          : input.localWon
            ? "VOCÊ VENCEU!"
            : "VOCÊ PERDEU";
    ctx.fillStyle = input.engineBlown ? "#ff2e2e" : input.localWon === false ? "#ff9b2f" : "#b8ff1f";
    ctx.font = "bold italic 32px 'Chakra Petch', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(header, x + panelWidth / 2, y + 48);

    const standings = solo
      ? ["Você"]
      : input.localWon === false
        ? ["Adversário", "Você"]
        : ["Você", "Adversário"];
    ctx.font = "bold 26px 'Chakra Petch', sans-serif";
    standings.forEach((name, index) => {
      const rowY = y + 100 + index * 44;
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillText(`${index + 1} :`, x + 32, rowY);
      ctx.textAlign = "right";
      ctx.fillStyle = name === "Você" ? "#b8ff1f" : "#ffffff";
      ctx.fillText(name, x + panelWidth - 32, rowY);
    });

    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText("Tempo:", x + 32, y + panelHeight - 28);
    ctx.textAlign = "right";
    ctx.fillStyle = "#b8ff1f";
    ctx.fillText(
      formatRaceTime(input.localFinishTimeSeconds ?? input.raceTimeSeconds),
      x + panelWidth - 32,
      y + panelHeight - 28,
    );
    ctx.restore();
  }
}

/** Formats seconds as m:ss.cc (e.g. 75.2 → "1:15.20"), NFSU2 results style. */
function formatRaceTime(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = Math.floor(clamped % 60);
  const hundredths = Math.floor((clamped % 1) * 100);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
}

// --- procedural textures ------------------------------------------------------

/**
 * Repeating asphalt tile (ribbon UVs are in 6m units, repeat = 1,1): smooth
 * dark racing tarmac — fine low-contrast aggregate, faint longitudinal wear
 * bands and darker tire lines instead of the old starry speckle.
 */
/**
 * Organic hill: a flattened hemisphere whose outline is warped by a couple of
 * low-frequency radial waves — a real morro silhouette, not a cone.
 */
function buildHillGeometry(radius: number, height: number, random: () => number): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const phase1 = random() * Math.PI * 2;
  const phase2 = random() * Math.PI * 2;
  const amp1 = 0.12 + random() * 0.12;
  const amp2 = 0.06 + random() * 0.1;
  const positions = geometry.getAttribute("position");
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const angle = Math.atan2(z, x);
    const warp = 1 + amp1 * Math.sin(3 * angle + phase1) + amp2 * Math.sin(5 * angle + phase2);
    positions.setXYZ(i, x * radius * warp, y * height, z * radius * warp);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function buildTiledAsphaltTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#26292e";
  ctx.fillRect(0, 0, size, size);

  const random = seededRandom("asphalt");
  // Longitudinal wear: subtle vertical bands (v runs along the track).
  for (let x = 0; x < size; x += 2) {
    const wear = 0.06 * Math.sin((x / size) * Math.PI * 2) + (random() - 0.5) * 0.04;
    ctx.fillStyle = wear > 0 ? `rgba(255,255,255,${wear * 0.5})` : `rgba(0,0,0,${-wear})`;
    ctx.fillRect(x, 0, 2, size);
  }
  // Fine aggregate, barely visible.
  for (let i = 0; i < 900; i++) {
    const shade = 34 + Math.floor(random() * 14);
    ctx.fillStyle = `rgba(${shade},${shade + 2},${shade + 5},0.5)`;
    ctx.fillRect(random() * size, random() * size, 1, 1);
  }
  // Darker rubbered-in tire lines either side of center.
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  for (const band of [0.24, 0.68]) {
    ctx.fillRect(size * band, 0, size * 0.09, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Red/white kerb bands; ribbon UVs are in 6m units → ~1.5m per band. */
function buildKerbTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 32;
  const ctx = canvas.getContext("2d")!;
  for (let band = 0; band < 4; band++) {
    ctx.fillStyle = band % 2 === 0 ? "#d21f2b" : "#f2f3f5";
    ctx.fillRect(0, band * 8, 8, 8);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

function buildCheckerTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 16;
  const ctx = canvas.getContext("2d")!;
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 2; y++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? "#ffffff" : "#0c0e14";
      ctx.fillRect(x * 8, y * 8, 8, 8);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

function buildFinishBannerTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(12,14,20,0.9)";
  ctx.fillRect(0, 0, 512, 64);
  ctx.fillStyle = "#ff5a1f";
  ctx.font = "bold 40px 'Chakra Petch', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("CHEGADA", 256, 34);
  return new THREE.CanvasTexture(canvas);
}

function buildWindowTexture(random: () => number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, 64, 64);
  for (let x = 4; x < 60; x += 8) {
    for (let y = 4; y < 60; y += 8) {
      if (random() < 0.35) {
        ctx.fillStyle = random() < 0.5 ? "#ffd888" : "#9fc6ff";
        ctx.fillRect(x, y, 4, 5);
      }
    }
  }
  return new THREE.CanvasTexture(canvas);
}

/**
 * Deterministic PRNG (mulberry32 over a string hash) so both players see the
 * same skyline for a given track id — the scene is decorative but shouldn't
 * differ between peers.
 */
function seededRandom(seed: string): () => number {
  let h = 1779033703;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let state = h >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let cachedLightPool: THREE.CanvasTexture | null = null;
function lightPoolTexture(): THREE.CanvasTexture {
  if (cachedLightPool) return cachedLightPool;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,220,150,0.9)");
  gradient.addColorStop(1, "rgba(255,220,150,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  cachedLightPool = new THREE.CanvasTexture(canvas);
  return cachedLightPool;
}
