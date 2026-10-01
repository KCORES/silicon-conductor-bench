import * as THREE from "three";

const MAX_BEND_RADIANS = THREE.MathUtils.degToRad(54);
const FIXED_BASE_RATIO = 0.15;
const ANIMATION_SECONDS = 1.8;
const EPSILON = 1e-5;

interface BendMesh {
  readonly mesh: THREE.Mesh;
  readonly original: Float32Array;
  readonly minY: number;
  readonly maxY: number;
  readonly centerX: number;
  readonly centerZ: number;
  readonly directionX: number;
  readonly directionZ: number;
}

export interface TrafficLightBendBounds {
  readonly minY: number;
  readonly maxY: number;
  readonly centerX: number;
  readonly centerZ: number;
}

export interface TrafficLightBendDirection {
  readonly x: number;
  readonly z: number;
}

export class TrafficLightBendController {
  private readonly meshes: BendMesh[] = [];
  private amount = 0;
  private from = 0;
  private target = 0;
  private elapsed = ANIMATION_SECONDS;

  get hasLights(): boolean {
    return this.meshes.length > 0;
  }

  add(root: THREE.Object3D, worldDirection: THREE.Vector3): void {
    root.updateMatrixWorld(true);
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }
      const geometry = child.geometry.clone();
      child.geometry = geometry;
      child.frustumCulled = false;
      const position = geometry.getAttribute("position");
      if (!(position instanceof THREE.BufferAttribute)) {
        return;
      }
      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox;
      if (bounds === null) {
        return;
      }
      const localDirection = worldDirection
        .clone()
        .applyQuaternion(child.getWorldQuaternion(new THREE.Quaternion()).invert());
      localDirection.y = 0;
      if (localDirection.lengthSq() < EPSILON) {
        localDirection.set(0, 0, 1);
      }
      localDirection.normalize();
      this.meshes.push({
        mesh: child,
        original: new Float32Array(position.array as ArrayLike<number>),
        minY: bounds.min.y,
        maxY: bounds.max.y,
        centerX: (bounds.min.x + bounds.max.x) / 2,
        centerZ: (bounds.min.z + bounds.max.z) / 2,
        directionX: localDirection.x,
        directionZ: localDirection.z,
      });
    });
  }

  bendAll(): void {
    this.animateTo(1);
  }

  resetAll(): void {
    this.animateTo(0);
  }

  setProgress(progress: number): void {
    this.amount = Math.min(1, Math.max(0, progress));
    this.from = this.amount;
    this.target = this.amount;
    this.elapsed = ANIMATION_SECONDS;
    this.paint();
  }

  update(deltaSeconds: number): void {
    if (this.elapsed >= ANIMATION_SECONDS || this.amount === this.target) {
      return;
    }
    this.elapsed = Math.min(
      ANIMATION_SECONDS,
      this.elapsed + Math.max(0, deltaSeconds),
    );
    const progress = smoothstep(this.elapsed / ANIMATION_SECONDS);
    this.amount = this.from + (this.target - this.from) * progress;
    this.paint();
  }

  dispose(): void {
    for (const item of this.meshes) {
      item.mesh.geometry.dispose();
    }
    this.meshes.length = 0;
  }

  private animateTo(target: number): void {
    this.from = this.amount;
    this.target = target;
    this.elapsed = 0;
    if (Math.abs(this.target - this.from) < EPSILON) {
      this.amount = target;
      this.elapsed = ANIMATION_SECONDS;
    }
  }

  private paint(): void {
    for (const item of this.meshes) {
      const position = item.mesh.geometry.getAttribute("position");
      if (!(position instanceof THREE.BufferAttribute)) {
        continue;
      }
      for (let index = 0; index < position.count; index += 1) {
        const offset = index * position.itemSize;
        const source = {
          x: item.original[offset] ?? 0,
          y: item.original[offset + 1] ?? 0,
          z: item.original[offset + 2] ?? 0,
        };
        const bent = bendTrafficLightVertex(
          source,
          item,
          { x: item.directionX, z: item.directionZ },
          this.amount,
        );
        position.setXYZ(index, bent.x, bent.y, bent.z);
      }
      position.needsUpdate = true;
      item.mesh.geometry.computeVertexNormals();
    }
  }
}

export function bendTrafficLightVertex(
  vertex: { readonly x: number; readonly y: number; readonly z: number },
  bounds: TrafficLightBendBounds,
  direction: TrafficLightBendDirection,
  amount: number,
): { readonly x: number; readonly y: number; readonly z: number } {
  const height = Math.max(EPSILON, bounds.maxY - bounds.minY);
  const hingeY = bounds.minY + height * FIXED_BASE_RATIO;
  if (vertex.y <= hingeY || amount <= 0) {
    return { ...vertex };
  }
  const flexibleHeight = Math.max(EPSILON, bounds.maxY - hingeY);
  const along = Math.min(flexibleHeight, vertex.y - hingeY);
  const maximumAngle = MAX_BEND_RADIANS * Math.min(1, Math.max(0, amount));
  const curvature = maximumAngle / flexibleHeight;
  if (curvature < EPSILON) {
    return { ...vertex };
  }
  const angle = curvature * along;
  const radius = 1 / curvature;
  const relativeX = vertex.x - bounds.centerX;
  const relativeZ = vertex.z - bounds.centerZ;
  const radial =
    relativeX * direction.x + relativeZ * direction.z;
  const perpendicularX = relativeX - direction.x * radial;
  const perpendicularZ = relativeZ - direction.z * radial;
  const curvedRadial = radius * (1 - Math.cos(angle)) + radial * Math.cos(angle);
  return {
    x: bounds.centerX + perpendicularX + direction.x * curvedRadial,
    y: hingeY + radius * Math.sin(angle) - radial * Math.sin(angle),
    z: bounds.centerZ + perpendicularZ + direction.z * curvedRadial,
  };
}

function smoothstep(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * (3 - 2 * clamped);
}
