import * as THREE from "three";

/**
 * One-shot engine explosion: an additive fireball burst + a light flash at the
 * moment the engine lets go, then a persistent dark smoke plume trailing from
 * the hood while the dead car coasts out. Purely visual — driven by the
 * renderer, no domain/physics coupling.
 */

const FIRE_PARTICLES = 90;
const FIRE_MIN_LIFE_S = 0.5;
const FIRE_MAX_LIFE_S = 1.1;
const FLASH_DURATION_S = 0.35;
/** Smoke emission starts heavy and settles to an idle smolder. */
const SMOKE_INITIAL_PER_SEC = 16;
const SMOKE_IDLE_PER_SEC = 5;
const SMOKE_SETTLE_SECONDS = 5;
const SMOKE_LIFE_S = 1.9;

interface FireParticle {
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface SmokePuff {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  velocity: THREE.Vector3;
  life: number;
}

export class ExplosionEffect {
  private readonly firePoints: THREE.Points;
  private readonly fireGeometry: THREE.BufferGeometry;
  private readonly fireMaterial: THREE.PointsMaterial;
  private readonly fireParticles: FireParticle[] = [];
  private readonly flash: THREE.PointLight;
  private readonly smokeTexture: THREE.Texture;
  private readonly smokeBaseMaterial: THREE.SpriteMaterial;
  private readonly puffs: SmokePuff[] = [];

  private burstAgeSeconds = Infinity;
  private smokeAgeSeconds = 0;
  private smokeCarry = 0;
  private smoking = false;

  constructor(private readonly scene: THREE.Scene) {
    const glow = buildGlowTexture();

    this.fireGeometry = new THREE.BufferGeometry();
    this.fireGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(new Float32Array(FIRE_PARTICLES * 3), 3),
    );
    this.fireGeometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(new Float32Array(FIRE_PARTICLES * 3), 3),
    );
    this.fireMaterial = new THREE.PointsMaterial({
      size: 1.5,
      map: glow,
      vertexColors: true, // colors fade to black = invisible under additive
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    this.firePoints = new THREE.Points(this.fireGeometry, this.fireMaterial);
    this.firePoints.visible = false;
    this.firePoints.frustumCulled = false;
    scene.add(this.firePoints);

    this.flash = new THREE.PointLight(0xffb054, 0, 40, 1.8);
    scene.add(this.flash);

    this.smokeTexture = glow;
    this.smokeBaseMaterial = new THREE.SpriteMaterial({
      map: glow,
      color: 0x1b1b1f,
      transparent: true,
      depthWrite: false,
    });
  }

  /** Detonates at the given world position and starts the smoke plume. */
  trigger(x: number, y: number, z: number): void {
    this.burstAgeSeconds = 0;
    this.smokeAgeSeconds = 0;
    this.smoking = true;

    const positions = this.fireGeometry.getAttribute("position") as THREE.BufferAttribute;
    this.fireParticles.length = 0;
    for (let i = 0; i < FIRE_PARTICLES; i++) {
      positions.setXYZ(i, x, y, z);
      // Random direction with an upward bias — a hood-out blast, not a ring.
      const theta = Math.random() * Math.PI * 2;
      const up = Math.random();
      const lateral = Math.sqrt(Math.max(0, 1 - up * up)) * (0.4 + Math.random() * 0.6);
      const speed = 3 + Math.random() * 9;
      this.fireParticles.push({
        velocity: new THREE.Vector3(
          Math.cos(theta) * lateral * speed,
          (0.5 + up) * speed * 0.8,
          Math.sin(theta) * lateral * speed,
        ),
        life: 0,
        maxLife: FIRE_MIN_LIFE_S + Math.random() * (FIRE_MAX_LIFE_S - FIRE_MIN_LIFE_S),
      });
    }
    positions.needsUpdate = true;
    this.firePoints.visible = true;

    this.flash.position.set(x, y + 1.2, z);
    this.flash.intensity = 140;
  }

  /**
   * Advances the effect. `emitter` is the world position smoke should pour
   * from (the blown car's hood) — pass null to stop emitting new puffs.
   */
  update(dtSeconds: number, emitter: { x: number; y: number; z: number } | null): void {
    if (dtSeconds <= 0) return;
    this.updateFireball(dtSeconds);
    this.updateSmoke(dtSeconds, emitter);
  }

  dispose(): void {
    this.scene.remove(this.firePoints, this.flash);
    for (const puff of this.puffs) {
      this.scene.remove(puff.sprite);
      puff.material.dispose();
    }
    this.puffs.length = 0;
    this.fireGeometry.dispose();
    this.fireMaterial.dispose();
    this.smokeBaseMaterial.dispose();
    this.smokeTexture.dispose();
  }

  private updateFireball(dtSeconds: number): void {
    if (!this.firePoints.visible) return;
    this.burstAgeSeconds += dtSeconds;

    const positions = this.fireGeometry.getAttribute("position") as THREE.BufferAttribute;
    const colors = this.fireGeometry.getAttribute("color") as THREE.BufferAttribute;
    let alive = 0;
    for (let i = 0; i < this.fireParticles.length; i++) {
      const p = this.fireParticles[i]!;
      p.life += dtSeconds;
      const t = Math.min(1, p.life / p.maxLife);
      if (t < 1) alive++;
      p.velocity.y -= 6 * dtSeconds; // soft gravity so the ball blooms up then sags
      p.velocity.multiplyScalar(1 - 1.6 * dtSeconds); // drag
      positions.setXYZ(
        i,
        positions.getX(i) + p.velocity.x * dtSeconds,
        positions.getY(i) + p.velocity.y * dtSeconds,
        positions.getZ(i) + p.velocity.z * dtSeconds,
      );
      // White-hot core -> orange -> ember red -> black (invisible, additive).
      const fade = 1 - t;
      colors.setXYZ(i, fade, fade * fade * 0.75 + fade * 0.2, fade * fade * 0.25);
    }
    positions.needsUpdate = true;
    colors.needsUpdate = true;

    this.flash.intensity = 140 * Math.max(0, 1 - this.burstAgeSeconds / FLASH_DURATION_S);
    if (alive === 0) {
      this.firePoints.visible = false;
      this.flash.intensity = 0;
    }
  }

  private updateSmoke(dtSeconds: number, emitter: { x: number; y: number; z: number } | null): void {
    if (this.smoking && emitter) {
      this.smokeAgeSeconds += dtSeconds;
      const settle = Math.min(1, this.smokeAgeSeconds / SMOKE_SETTLE_SECONDS);
      const rate = SMOKE_INITIAL_PER_SEC + (SMOKE_IDLE_PER_SEC - SMOKE_INITIAL_PER_SEC) * settle;
      this.smokeCarry += rate * dtSeconds;
      while (this.smokeCarry >= 1) {
        this.smokeCarry -= 1;
        this.spawnPuff(emitter);
      }
    }

    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const puff = this.puffs[i]!;
      puff.life += dtSeconds;
      const t = puff.life / SMOKE_LIFE_S;
      if (t >= 1) {
        this.scene.remove(puff.sprite);
        puff.material.dispose();
        this.puffs.splice(i, 1);
        continue;
      }
      puff.sprite.position.addScaledVector(puff.velocity, dtSeconds);
      const scale = 0.7 + t * 2.6;
      puff.sprite.scale.setScalar(scale);
      puff.material.opacity = 0.55 * (1 - t) * (0.35 + 0.65 * Math.min(1, t * 4));
    }
  }

  private spawnPuff(emitter: { x: number; y: number; z: number }): void {
    const material = this.smokeBaseMaterial.clone();
    const sprite = new THREE.Sprite(material);
    sprite.position.set(
      emitter.x + (Math.random() - 0.5) * 0.5,
      emitter.y + (Math.random() - 0.5) * 0.2,
      emitter.z + (Math.random() - 0.5) * 0.5,
    );
    sprite.scale.setScalar(0.7);
    this.scene.add(sprite);
    this.puffs.push({
      sprite,
      material,
      velocity: new THREE.Vector3((Math.random() - 0.5) * 0.7, 1.6 + Math.random() * 0.9, (Math.random() - 0.5) * 0.7),
      life: 0,
    });
  }
}

/** Soft radial gradient — shared by fire particles (additive) and smoke sprites. */
function buildGlowTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.4, "rgba(255,255,255,0.55)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
