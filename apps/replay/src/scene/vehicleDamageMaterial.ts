import * as THREE from "three";
import { TessellateModifier } from "three/examples/jsm/modifiers/TessellateModifier.js";
import type { CollisionVector, IncidentSummary } from "../../../../src/core/types.js";
import { damageAmount } from "@replay/collisionVisual.js";

export interface VehicleDamageController {
  setDamage(
    severity: IncidentSummary["severity"],
    contactNormal: CollisionVector,
    deformation?: number,
    vehicleHeading?: number,
    options?: {
      readonly sphericalDent?: boolean;
      readonly dentRadius?: number;
      readonly dentDepth?: number;
      readonly contactPointBody?: CollisionVector;
    },
  ): void;
  setSmoke(elapsedSeconds: number | undefined): void;
  clearDamage(): void;
  dispose(): void;
}

interface DamageMaterial {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  baseColor: THREE.Color;
  baseRoughness: number;
  dent?: DentUniforms;
}

interface DentUniforms {
  readonly amount: { value: number };
  readonly center: { value: THREE.Vector3 };
  readonly direction: { value: THREE.Vector3 };
  readonly radius: { value: number };
  readonly depth: { value: number };
  readonly floor: { value: number };
  readonly meshToBody: { value: THREE.Matrix4 };
  readonly bodyToMesh: { value: THREE.Matrix4 };
}

let sharedSmokeTexture: THREE.CanvasTexture | undefined;
let dentProgramSequence = 0;
const dentGeometryCache = new WeakMap<
  THREE.BufferGeometry,
  { geometry: THREE.BufferGeometry; references: number }
>();

interface SmokeParticle {
  readonly sprite: THREE.Sprite;
  readonly phase: number;
}

export function createVehicleDamageController(
  model: THREE.Object3D,
  body: THREE.Group,
  bounds: THREE.Box3,
): VehicleDamageController {
  const materials: DamageMaterial[] = [];
  const preparedMeshes = new WeakSet<THREE.Mesh>();
  const dentGeometrySources = new Set<THREE.BufferGeometry>();
  const size = bounds.getSize(new THREE.Vector3());
  let smoke: THREE.Group | undefined;
  let smokeParticles: readonly SmokeParticle[] = [];
  const smokeOrigin = new THREE.Vector3();
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    const childMaterials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    for (const material of childMaterials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) {
        continue;
      }
      materials.push({
        mesh: child,
        material,
        baseColor: material.color.clone(),
        baseRoughness: material.roughness,
      });
    }
  });
  return {
    setDamage(
      severity,
      contactNormal,
      deformation,
      vehicleHeading = 0,
      options,
    ) {
      const amount = Math.min(
        1,
        Math.max(0, deformation ?? damageAmount(severity)),
      );
      const inwardHeading =
        Math.atan2(contactNormal.x, contactNormal.z) - vehicleHeading;
      const inward = new THREE.Vector3(
        Math.sin(inwardHeading),
        0,
        Math.cos(inwardHeading),
      ).normalize();
      const outward = inward.clone().multiplyScalar(-1);
      const compression = 1 - amount * 0.18;
      body.scale.set(
        Math.abs(inward.x) >= Math.abs(inward.z) ? compression : 1,
        1 - amount * 0.045,
        Math.abs(inward.z) > Math.abs(inward.x) ? compression : 1,
      );
      const halfWidth = Math.max(0.1, size.x * 0.5);
      const halfLength = Math.max(0.1, size.z * 0.5);
      const surfaceDistance = Math.max(
        0.1,
        Math.min(
          halfWidth / Math.max(0.001, Math.abs(outward.x)),
          halfLength / Math.max(0.001, Math.abs(outward.z)),
        ),
      );
      const dentCenter = new THREE.Vector3(
        options?.contactPointBody?.x ?? outward.x * surfaceDistance,
        Math.max(0.3, size.y * 0.53),
        options?.contactPointBody?.z ?? outward.z * surfaceDistance,
      );
      dentCenter.x = THREE.MathUtils.clamp(dentCenter.x, -halfWidth, halfWidth);
      dentCenter.z = THREE.MathUtils.clamp(
        dentCenter.z,
        -halfLength,
        halfLength,
      );
      if (options?.sphericalDent === true) {
        for (const state of materials) {
          if (isRigidRunningGear(state.mesh)) {
            continue;
          }
          prepareDentGeometry(
            state.mesh,
            preparedMeshes,
            dentGeometrySources,
          );
          state.dent ??= installDentShader(state, body, bounds);
          state.dent.amount.value = 1;
          state.dent.center.value.copy(dentCenter);
          state.dent.direction.value.copy(inward);
          state.dent.radius.value = Math.max(
            0.18,
            options.dentRadius ?? Math.min(size.x, size.z) * 0.42,
          );
          state.dent.depth.value = Math.max(
            0.04,
            options.dentDepth ?? amount * 0.62,
          );
        }
      } else {
        for (const state of materials) {
          if (state.dent !== undefined) {
            state.dent.amount.value = 0;
          }
        }
      }
      smokeOrigin.set(
        outward.x * surfaceDistance * 0.72,
        Math.max(0.5, size.y * 0.82),
        outward.z * surfaceDistance * 0.72,
      );
      for (const state of materials) {
        state.material.color
          .copy(state.baseColor)
          .multiplyScalar(1 - amount * 0.06);
        state.material.roughness = Math.min(
          1,
          state.baseRoughness + amount * 0.12,
        );
      }
    },
    setSmoke(elapsedSeconds) {
      if (
        elapsedSeconds === undefined ||
        elapsedSeconds < 0 ||
        elapsedSeconds >= 5
      ) {
        if (smoke !== undefined) {
          smoke.visible = false;
        }
        return;
      }
      if (smoke === undefined) {
        const created = createSmoke(body);
        smoke = created.group;
        smokeParticles = created.particles;
      }
      smoke.visible = true;
      const fadeOut = 1 - Math.max(0, elapsedSeconds - 4) / 1;
      for (const particle of smokeParticles) {
        const progress = (elapsedSeconds * 0.55 + particle.phase) % 1;
        const drift = Math.sin((elapsedSeconds + particle.phase) * 2.3) * 0.16;
        particle.sprite.position.set(
          smokeOrigin.x + drift,
          smokeOrigin.y + progress * Math.max(1.8, size.y * 1.35),
          smokeOrigin.z + Math.cos((elapsedSeconds + particle.phase) * 1.9) * 0.1,
        );
        particle.sprite.scale.setScalar(0.52 + progress * 1.22);
        particle.sprite.material.opacity =
          Math.sin(progress * Math.PI) * 0.68 * fadeOut;
      }
    },
    clearDamage() {
      body.scale.set(1, 1, 1);
      if (smoke !== undefined) {
        smoke.visible = false;
      }
      for (const state of materials) {
        if (state.dent !== undefined) {
          state.dent.amount.value = 0;
        }
        state.material.color.copy(state.baseColor);
        state.material.roughness = state.baseRoughness;
      }
    },
    dispose() {
      for (const particle of smokeParticles) {
        particle.sprite.material.dispose();
      }
      for (const source of dentGeometrySources) {
        const cached = dentGeometryCache.get(source);
        if (cached === undefined) {
          continue;
        }
        cached.references -= 1;
        if (cached.references <= 0) {
          cached.geometry.dispose();
          dentGeometryCache.delete(source);
        }
      }
      dentGeometrySources.clear();
      smoke?.removeFromParent();
      smoke = undefined;
      smokeParticles = [];
    },
  };
}

function prepareDentGeometry(
  mesh: THREE.Mesh,
  prepared: WeakSet<THREE.Mesh>,
  sources: Set<THREE.BufferGeometry>,
): void {
  if (prepared.has(mesh) || mesh instanceof THREE.SkinnedMesh) {
    return;
  }
  prepared.add(mesh);
  const source = mesh.geometry;
  const cached = dentGeometryCache.get(source);
  if (cached !== undefined) {
    cached.references += 1;
    mesh.geometry = cached.geometry;
    sources.add(source);
    return;
  }
  source.computeBoundingBox();
  const extent = source.boundingBox?.getSize(new THREE.Vector3());
  const longest = extent === undefined ? 0 : Math.max(extent.x, extent.y, extent.z);
  if (!Number.isFinite(longest) || longest <= 0) {
    return;
  }
  const geometry = new TessellateModifier(longest / 9, 3).modify(
    source.clone(),
  );
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  dentGeometryCache.set(source, { geometry, references: 1 });
  mesh.geometry = geometry;
  sources.add(source);
}

function isRigidRunningGear(mesh: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = mesh;
  while (current !== null) {
    if (/(wheel|tire|tyre|rim|axle)/i.test(current.name)) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function installDentShader(
  state: DamageMaterial,
  body: THREE.Object3D,
  bounds: THREE.Box3,
): DentUniforms {
  const programKey = `vehicle-spherical-dent-v1-${dentProgramSequence}`;
  dentProgramSequence += 1;
  body.updateWorldMatrix(true, true);
  state.mesh.updateWorldMatrix(true, false);
  const meshToBody = new THREE.Matrix4()
    .copy(body.matrixWorld)
    .invert()
    .multiply(state.mesh.matrixWorld);
  const bodyToMesh = meshToBody.clone().invert();
  const uniforms: DentUniforms = {
    amount: { value: 0 },
    center: { value: new THREE.Vector3() },
    direction: { value: new THREE.Vector3(0, 0, -1) },
    radius: { value: 0.6 },
    depth: { value: 0.25 },
    floor: {
      value: bounds.min.y + Math.max(0.08, bounds.getSize(new THREE.Vector3()).y * 0.18),
    },
    meshToBody: { value: meshToBody },
    bodyToMesh: { value: bodyToMesh },
  };
  const previousCompile = state.material.onBeforeCompile;
  state.material.onBeforeCompile = (shader, renderer) => {
    previousCompile(shader, renderer);
    shader.uniforms.uDentAmount = uniforms.amount;
    shader.uniforms.uDentCenter = uniforms.center;
    shader.uniforms.uDentDirection = uniforms.direction;
    shader.uniforms.uDentRadius = uniforms.radius;
    shader.uniforms.uDentDepth = uniforms.depth;
    shader.uniforms.uDentFloor = uniforms.floor;
    shader.uniforms.uMeshToBody = uniforms.meshToBody;
    shader.uniforms.uBodyToMesh = uniforms.bodyToMesh;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uDentAmount;
uniform vec3 uDentCenter;
uniform vec3 uDentDirection;
uniform float uDentRadius;
uniform float uDentDepth;
uniform float uDentFloor;
uniform mat4 uMeshToBody;
uniform mat4 uBodyToMesh;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vec3 dentBodyPosition = (uMeshToBody * vec4(transformed, 1.0)).xyz;
float dentDistance = distance(dentBodyPosition, uDentCenter);
float dentFalloff = 1.0 - smoothstep(uDentRadius * 0.12, uDentRadius, dentDistance);
float dentHeight = smoothstep(uDentFloor, uDentFloor + uDentRadius * 0.28, dentBodyPosition.y);
float dentDisplacement = uDentAmount * uDentDepth * dentFalloff * dentFalloff * dentHeight;
dentBodyPosition += normalize(uDentDirection + vec3(0.00001)) * dentDisplacement;
transformed = (uBodyToMesh * vec4(dentBodyPosition, 1.0)).xyz;`,
      );
  };
  state.material.customProgramCacheKey = () => programKey;
  state.material.needsUpdate = true;
  return uniforms;
}

function createSmoke(parent: THREE.Object3D): {
  readonly group: THREE.Group;
  readonly particles: readonly SmokeParticle[];
} {
  const group = new THREE.Group();
  group.name = "vehicle-collision-smoke";
  const particles = Array.from({ length: 5 }, (_, index) => {
    const material = new THREE.SpriteMaterial({
      map: smokeTexture(),
      color: index % 2 === 0 ? 0x30363a : 0x50575a,
      transparent: true,
      depthWrite: false,
      opacity: 0,
    });
    const sprite = new THREE.Sprite(material);
    sprite.renderOrder = 4;
    group.add(sprite);
    return { sprite, phase: index / 5 };
  });
  parent.add(group);
  return { group, particles };
}

function smokeTexture(): THREE.CanvasTexture {
  if (sharedSmokeTexture !== undefined) {
    return sharedSmokeTexture;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (context !== null) {
    const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 30);
    gradient.addColorStop(0, "rgba(220, 225, 226, 0.72)");
    gradient.addColorStop(0.42, "rgba(114, 122, 125, 0.46)");
    gradient.addColorStop(1, "rgba(61, 67, 70, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
  }
  sharedSmokeTexture = new THREE.CanvasTexture(canvas);
  sharedSmokeTexture.colorSpace = THREE.SRGBColorSpace;
  return sharedSmokeTexture;
}
