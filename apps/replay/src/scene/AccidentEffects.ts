import * as THREE from "three";
import {
  accidentImpactStyle,
  vehicleImpactNudge,
  type AccidentImpactStyle,
  type VehicleImpactNudge,
} from "@replay/accidentCues.js";

const POOL_SIZE = 4;
const SPARK_COUNT = 6;
const BURST_SECONDS = 0.65;

export interface AccidentBurstRequest {
  readonly x: number;
  readonly z: number;
  readonly vehicleIds: readonly string[];
  readonly headings: readonly number[];
  readonly intensity?: number;
}

interface BurstSlot {
  readonly group: THREE.Group;
  readonly star: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  readonly ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  readonly sparks: readonly THREE.Mesh<
    THREE.BoxGeometry,
    THREE.MeshBasicMaterial
  >[];
  readonly sparkDirs: readonly THREE.Vector3[];
  active: boolean;
  age: number;
  style: AccidentImpactStyle;
  vehicleIds: readonly string[];
  headings: readonly number[];
  intensity: number;
}

const ZERO_NUDGE: VehicleImpactNudge = { x: 0, y: 0, z: 0, yaw: 0 };

/**
 * Pooled arcade hit: one star, one ring, and a handful of sparks.
 * Geometry and materials are allocated once. No lights, shadows, or postprocessing.
 */
export class AccidentEffects {
  private readonly slots: readonly BurstSlot[];
  private readonly shake = new THREE.Vector3();
  private readonly reducedMotion: boolean;

  constructor(scene: THREE.Scene) {
    this.reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const root = new THREE.Group();
    root.name = "accident-effects";
    this.slots = Array.from({ length: POOL_SIZE }, () => createSlot(root));
    scene.add(root);
  }

  trigger(request: AccidentBurstRequest): void {
    if (this.reducedMotion) {
      return;
    }
    const slot = this.claimSlot();
    slot.active = true;
    slot.age = 0;
    slot.style = accidentImpactStyle(request.headings);
    slot.vehicleIds = request.vehicleIds;
    slot.headings = request.headings;
    slot.intensity = Math.min(1, Math.max(0.2, request.intensity ?? 0.6));
    slot.group.visible = true;
    slot.group.position.set(request.x, 1.6, request.z);
    paintSlot(slot, 0);
  }

  clear(): void {
    for (const slot of this.slots) {
      retire(slot);
    }
    this.shake.set(0, 0, 0);
  }

  update(deltaSeconds: number): void {
    this.shake.set(0, 0, 0);
    if (this.reducedMotion) {
      return;
    }
    // A hitch must not spend the whole burst in the same frame that discovered it.
    const step = Math.min(Math.max(deltaSeconds, 0), 1 / 30);
    for (const slot of this.slots) {
      if (!slot.active) {
        continue;
      }
      slot.age += step;
      const progress = slot.age / BURST_SECONDS;
      if (progress >= 1) {
        retire(slot);
        continue;
      }
      paintSlot(slot, progress);
      const fade = 1 - progress;
      this.shake.x += Math.sin(slot.age * 34) * 0.035 * fade * slot.intensity;
      this.shake.z += Math.cos(slot.age * 29) * 0.025 * fade * slot.intensity;
    }
  }

  vehicleNudge(vehicleId: string): VehicleImpactNudge {
    if (this.reducedMotion) {
      return ZERO_NUDGE;
    }
    let x = 0;
    let y = 0;
    let z = 0;
    let yaw = 0;
    let hits = 0;
    for (const slot of this.slots) {
      if (!slot.active) {
        continue;
      }
      const index = slot.vehicleIds.indexOf(vehicleId);
      const heading = slot.headings[index];
      if (index < 0 || heading === undefined) {
        continue;
      }
      const nudge = vehicleImpactNudge(
        slot.style,
        heading,
        index,
        slot.age / BURST_SECONDS,
      );
      x += nudge.x;
      y += nudge.y;
      z += nudge.z;
      yaw += nudge.yaw;
      hits += 1;
    }
    return hits === 0 ? ZERO_NUDGE : { x, y, z, yaw };
  }

  /** World-space offset applied to the shared camera for this frame only. */
  cameraNudge(): THREE.Vector3 {
    return this.shake;
  }

  private claimSlot(): BurstSlot {
    const idle = this.slots.find((slot) => !slot.active);
    if (idle !== undefined) {
      return idle;
    }
    return this.slots.reduce((oldest, slot) =>
      slot.age > oldest.age ? slot : oldest,
    );
  }
}

function createSlot(parent: THREE.Group): BurstSlot {
  const group = new THREE.Group();
  group.visible = false;
  const star = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 5),
    new THREE.MeshBasicMaterial({
      color: 0x77736d,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  star.castShadow = false;
  star.receiveShadow = false;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.22, 0.34, 20),
    new THREE.MeshBasicMaterial({
      color: 0xaaa59b,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.castShadow = false;
  ring.receiveShadow = false;
  const sparks: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>[] = [];
  const sparkDirs: THREE.Vector3[] = [];
  const sparkGeometry = new THREE.BoxGeometry(0.08, 0.08, 0.16);
  for (let index = 0; index < SPARK_COUNT; index += 1) {
    const spark = new THREE.Mesh(
      sparkGeometry,
      new THREE.MeshBasicMaterial({
        color: index % 3 === 0 ? 0xd4e2e5 : 0x5e6062,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    spark.castShadow = false;
    spark.receiveShadow = false;
    const angle = (index / SPARK_COUNT) * Math.PI * 2;
    sparkDirs.push(
      new THREE.Vector3(
        Math.cos(angle),
        0.35 + (index % 3) * 0.12,
        Math.sin(angle),
      ),
    );
    sparks.push(spark);
    group.add(spark);
  }
  group.add(star, ring);
  parent.add(group);
  return {
    group,
    star,
    ring,
    sparks,
    sparkDirs,
    active: false,
    age: 0,
    style: "rear",
    vehicleIds: [],
    headings: [],
    intensity: 0.6,
  };
}

function paintSlot(slot: BurstSlot, progress: number): void {
  const fade = 1 - progress;
  slot.star.scale.set(
    1.2 + progress * 5,
    0.45 + progress * 1.4,
    1.2 + progress * 5,
  );
  slot.star.rotation.y = progress * 0.35;
  slot.star.material.opacity = fade * 0.38 * slot.intensity;
  slot.ring.scale.setScalar(0.8 + progress * 7);
  slot.ring.material.opacity = fade * 0.26 * slot.intensity;
  slot.sparks.forEach((spark, index) => {
    const dir = slot.sparkDirs[index];
    if (dir === undefined) {
      return;
    }
    spark.position
      .copy(dir)
      .multiplyScalar((0.35 + progress * 2.4) * slot.intensity);
    spark.material.opacity = fade * 0.72;
    spark.scale.setScalar(2.2 * (1 - progress * 0.45));
  });
}

function retire(slot: BurstSlot): void {
  slot.active = false;
  slot.group.visible = false;
  slot.vehicleIds = [];
  slot.headings = [];
  slot.intensity = 0.6;
}
