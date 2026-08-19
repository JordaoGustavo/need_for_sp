import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { RaceRenderInput, RaceRenderer, RenderedCar } from "../renderer";
import type { TrackDefinition } from "../../domain/track";
import { applyCarEnvironmentMap, buildCarMesh, disposeCarMesh } from "./carMesh";
import { animateCrowd, buildCrowd, sendCrowdToCar, type CrowdPerson } from "./crowd";
import { TRACK_END_RUNOFF_METERS } from "../../physics/carPhysics";

const HUD_HEIGHT_FRACTION = 0.3;

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
  private crowdPeople: CrowdPerson[] = [];
  private crowdMobilized = false;
  private lastFrameMs: number | null = null;
  private carMeshes: { carId: string; mesh: THREE.Group }[] = [];
  private disposed = false;

  constructor(private readonly container: HTMLElement) {
    this.webgl = new THREE.WebGLRenderer({ antialias: true });
    this.webgl.domElement.className = "race-canvas-3d";
    container.appendChild(this.webgl.domElement);

    const overlay = document.createElement("canvas");
    overlay.className = "race-canvas-overlay";
    container.appendChild(overlay);
    const ctx = overlay.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable for HUD overlay");
    this.overlayCtx = ctx;

    this.scene.background = new THREE.Color(0x05070f);
    this.scene.fog = new THREE.Fog(0x05070f, 60, 320);

    // Env map applied to CAR materials only (applyCarEnvironmentMap): setting
    // scene.environment would brighten every building and kill the night mood.
    const pmrem = new THREE.PMREMGenerator(this.webgl);
    this.carEnvMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.scene.add(new THREE.HemisphereLight(0x2a3550, 0x0a0c12, 0.9));
    const moon = new THREE.DirectionalLight(0x8fa8ff, 0.7);
    moon.position.set(40, 80, -30);
    this.scene.add(moon);
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
      sendCrowdToCar(
        this.crowdPeople,
        localCar.state.lateralOffsetMeters,
        -localCar.state.distanceMeters,
        seededRandom(`${input.track.id}-mob`),
      );
    }
    animateCrowd(this.crowdPeople, nowMs / 1000, dtSeconds);

    if (localCar) this.updateChaseCamera(localCar);

    this.webgl.render(this.scene, this.camera);
    this.drawOverlay(input);
  }

  dispose(): void {
    this.disposed = true;
    for (const entry of this.carMeshes) disposeCarMesh(entry.mesh);
    this.webgl.dispose();
    this.webgl.domElement.remove();
    this.overlayCtx.canvas.remove();
  }

  // --- scene construction -------------------------------------------------

  private buildTrackScene(track: TrackDefinition): void {
    const length = track.lengthMeters;
    const width = track.widthMeters;

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(400, length + 400),
      new THREE.MeshStandardMaterial({ color: 0x0a0d13, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.02, -length / 2);
    this.scene.add(ground);

    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(width, length + 120),
      new THREE.MeshStandardMaterial({ map: buildAsphaltTexture(width, length + 120), roughness: 0.95 }),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, -(length + 120) / 2 + 40);
    this.scene.add(road);

    this.addLine(0, "#ffffff", 0.35, track, true);
    this.addLine(-width / 2 + 0.3, "#f2d200", 1, track, false);
    this.addLine(width / 2 - 0.3, "#f2d200", 1, track, false);

    this.addStartAndFinishLines(track);
    this.addBarriers(track);
    this.addStreetLights(track);
    this.addBuildings(track);
    this.addEndWall(track);

    const crowd = buildCrowd(
      seededRandom(`${track.id}-crowd`),
      track.lengthMeters,
      track.widthMeters,
      TRACK_END_RUNOFF_METERS,
    );
    this.scene.add(crowd.group);
    this.crowdPeople = crowd.people;

    // Floodlights over the finish area so the celebration is actually lit.
    for (const distance of [track.lengthMeters + 5, track.lengthMeters + TRACK_END_RUNOFF_METERS * 0.6]) {
      const flood = new THREE.PointLight(0xfff0cc, 60, 55, 1.6);
      flood.position.set(0, 9, -distance);
      this.scene.add(flood);
    }
  }

  /** Striped barrier wall closing off the runoff area past the finish line. */
  private addEndWall(track: TrackDefinition): void {
    const wallZ = -(track.lengthMeters + TRACK_END_RUNOFF_METERS + 1.5);
    const width = track.widthMeters + 4;

    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(width, 1.4, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x353c48, roughness: 0.7 }),
    );
    wall.position.set(0, 0.7, wallZ);
    this.scene.add(wall);

    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.05, 0.3, 0.62),
      new THREE.MeshStandardMaterial({
        color: 0xff5a1f,
        emissive: 0xff5a1f,
        emissiveIntensity: 0.5,
      }),
    );
    stripe.position.set(0, 1.0, wallZ);
    this.scene.add(stripe);

    // A row of tire stacks in front of the wall.
    const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x101318, roughness: 0.95 });
    const tireGeometry = new THREE.TorusGeometry(0.34, 0.14, 8, 14);
    tireGeometry.rotateX(Math.PI / 2);
    for (let x = -width / 2 + 1; x <= width / 2 - 1; x += 1.1) {
      for (let level = 0; level < 3; level++) {
        const tire = new THREE.Mesh(tireGeometry, tireMaterial);
        tire.position.set(x, 0.15 + level * 0.28, wallZ + 0.85);
        this.scene.add(tire);
      }
    }
  }

  private addLine(
    x: number,
    color: string,
    opacity: number,
    track: TrackDefinition,
    dashed: boolean,
  ): void {
    const length = track.lengthMeters + 120;
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: opacity < 1,
      opacity,
    });
    if (dashed) {
      for (let z = 30; z > -length; z -= 12) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 5), material);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(x, 0.01, z);
        this.scene.add(dash);
      }
    } else {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.25, length), material);
      line.rotation.x = -Math.PI / 2;
      line.position.set(x, 0.01, -length / 2 + 40);
      this.scene.add(line);
    }
  }

  private addStartAndFinishLines(track: TrackDefinition): void {
    const texture = buildCheckerTexture();
    for (const distance of [0, track.lengthMeters]) {
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(track.widthMeters, 2),
        new THREE.MeshBasicMaterial({ map: texture }),
      );
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(0, 0.02, -distance);
      this.scene.add(stripe);
    }

    // Overhead gantry at the finish line, so the player sees it coming from afar.
    const gantryMaterial = new THREE.MeshStandardMaterial({ color: 0x2a303c, roughness: 0.6 });
    const halfWidth = track.widthMeters / 2 + 1;
    for (const side of [-halfWidth, halfWidth]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.5), gantryMaterial);
      post.position.set(side, 3.5, -track.lengthMeters);
      this.scene.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(halfWidth * 2 + 0.5, 1.2, 0.6), gantryMaterial);
    beam.position.set(0, 7, -track.lengthMeters);
    this.scene.add(beam);
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(halfWidth * 2, 1),
      new THREE.MeshBasicMaterial({ map: buildFinishBannerTexture(), transparent: true }),
    );
    banner.position.set(0, 6.2, -track.lengthMeters + 0.35);
    this.scene.add(banner);
  }

  private addBarriers(track: TrackDefinition): void {
    const length = track.lengthMeters + 120;
    const barrierMaterial = new THREE.MeshStandardMaterial({ color: 0x353c48, roughness: 0.7 });
    const stripeMaterial = new THREE.MeshBasicMaterial({ color: 0xff5a1f });
    for (const side of [-1, 1]) {
      const x = side * (track.widthMeters / 2 + 0.6);
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.9, length), barrierMaterial);
      wall.position.set(x, 0.45, -length / 2 + 40);
      this.scene.add(wall);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, length), stripeMaterial);
      stripe.position.set(x, 0.75, -length / 2 + 40);
      this.scene.add(stripe);
    }
  }

  private addStreetLights(track: TrackDefinition): void {
    const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x1c212b, roughness: 0.6 });
    const lampMaterial = new THREE.MeshStandardMaterial({
      color: 0xffe9b8,
      emissive: 0xffd888,
      emissiveIntensity: 2.5,
    });
    const poleGeometry = new THREE.CylinderGeometry(0.12, 0.16, 7, 8);
    const armGeometry = new THREE.BoxGeometry(0.15, 0.15, 2.4);
    const lampGeometry = new THREE.BoxGeometry(0.5, 0.18, 0.9);

    for (let distance = 20; distance < track.lengthMeters + 60; distance += 40) {
      const side = (distance / 40) % 2 === 0 ? -1 : 1;
      const x = side * (track.widthMeters / 2 + 1.6);
      const pole = new THREE.Mesh(poleGeometry, poleMaterial);
      pole.position.set(x, 3.5, -distance);
      this.scene.add(pole);
      const arm = new THREE.Mesh(armGeometry, poleMaterial);
      arm.position.set(x - side * 1.1, 6.9, -distance);
      arm.rotation.y = Math.PI / 2;
      this.scene.add(arm);
      const lamp = new THREE.Mesh(lampGeometry, lampMaterial);
      lamp.position.set(x - side * 2.1, 6.8, -distance);
      this.scene.add(lamp);

      // Pool of light on the asphalt, faked with an additive gradient decal —
      // real PointLights at every pole would blow the light budget.
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
      pool.position.set(x - side * 2.1, 0.015, -distance);
      this.scene.add(pool);
    }
  }

  private addBuildings(track: TrackDefinition): void {
    const random = seededRandom(track.id);
    const windowTexture = buildWindowTexture(random);
    for (let distance = -30; distance < track.lengthMeters + 80; distance += 18) {
      for (const side of [-1, 1]) {
        if (random() < 0.2) continue;
        const buildingWidth = 10 + random() * 8;
        const buildingHeight = 10 + random() * 30;
        const buildingDepth = 12 + random() * 6;
        const building = new THREE.Mesh(
          new THREE.BoxGeometry(buildingWidth, buildingHeight, buildingDepth),
          new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(0.62, 0.15, 0.05 + random() * 0.05),
            emissive: 0x2b3a55,
            emissiveIntensity: 0.25,
            emissiveMap: windowTexture,
            roughness: 0.9,
          }),
        );
        const x = side * (track.widthMeters / 2 + 14 + random() * 20);
        building.position.set(x, buildingHeight / 2, -distance);
        this.scene.add(building);
      }
    }
  }

  // --- per-frame updates ----------------------------------------------------

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
      entry.mesh.position.set(car.state.lateralOffsetMeters, 0, -car.state.distanceMeters);
      entry.mesh.rotation.y = -car.state.headingRad;
    }
  }

  private updateChaseCamera(localCar: RenderedCar): void {
    const carX = localCar.state.lateralOffsetMeters;
    const carZ = -localCar.state.distanceMeters;
    const heading = localCar.state.headingRad;
    const speedFraction = Math.min(1, Math.abs(localCar.state.speedKmh) / 260);

    // Rigid follow, rotated with the car's heading so steering/reversing keeps
    // the camera behind the car (forward in world space is (sin h, -cos h)).
    const sin = Math.sin(heading);
    const cos = Math.cos(heading);
    const back = 8.5 + speedFraction * 2;
    this.camera.position.set(carX - sin * back, 3.2 + speedFraction * 0.6, carZ + cos * back);
    this.camera.lookAt(carX + sin * 12, 1.2, carZ - cos * 12);
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

    // Track path: the drag strip runs bottom (start) to top (finish).
    const pathTop = cy - radius * 0.72;
    const pathBottom = cy + radius * 0.72;
    const metersToPx = (pathBottom - pathTop) / input.track.lengthMeters;

    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = radius * 0.14;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx, pathBottom);
    ctx.lineTo(cx, pathTop);
    ctx.stroke();

    // Finish tick
    ctx.strokeStyle = "#0c0e14";
    ctx.lineWidth = radius * 0.05;
    ctx.beginPath();
    ctx.moveTo(cx - radius * 0.1, pathTop);
    ctx.lineTo(cx + radius * 0.1, pathTop);
    ctx.stroke();

    for (const car of input.cars) {
      const y = pathBottom - car.state.distanceMeters * metersToPx;
      const x = cx + car.state.lateralOffsetMeters * metersToPx * 6;
      this.drawMinimapArrow(x, y, car.isLocalPlayer ? "#39d353" : "#ff9b2f", radius * 0.14, car.state.headingRad);
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
    const header = solo
      ? "CHEGADA!"
      : input.localWon === null
        ? "CHEGADA"
        : input.localWon
          ? "VOCÊ VENCEU!"
          : "VOCÊ PERDEU";
    ctx.fillStyle = input.localWon === false ? "#ff9b2f" : "#b8ff1f";
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

function buildAsphaltTexture(widthMeters: number, lengthMeters: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#191d24";
  ctx.fillRect(0, 0, 128, 128);
  const random = seededRandom("asphalt");
  for (let i = 0; i < 500; i++) {
    const shade = 20 + Math.floor(random() * 25);
    ctx.fillStyle = `rgb(${shade},${shade + 2},${shade + 6})`;
    ctx.fillRect(random() * 128, random() * 128, 1.5, 1.5);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(widthMeters / 6, lengthMeters / 6);
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
