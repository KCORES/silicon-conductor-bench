import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { isRigidRunningGear } from "./vehicleDamageMaterial.js";
import { isWheelNode } from "./vehiclePaintMaterial.js";

/** userData flag on wheel meshes, merged or not, so spawned vehicles can skip their shadows. */
export const VEHICLE_WHEEL_FLAG = "vehicleWheel";

const WHEEL_NAME = /(?:wheel|tire|tyre)|^[FR][LR]\d*$/iu;

/**
 * Bakes a template's separate wheel meshes into one mesh per material.
 * Wheels are grouped by the paint and damage rules that see them, and the merged
 * name must keep both rules' answers, so painted or dented wheels stay that way.
 */
export function mergeVehicleWheels(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const toRoot = root.matrixWorld.clone().invert();
  const groups = new Map<
    string,
    { meshes: THREE.Mesh[]; painted: boolean; rigid: boolean }
  >();
  root.traverse((child) => {
    if (
      !(child instanceof THREE.Mesh) ||
      child instanceof THREE.SkinnedMesh ||
      child instanceof THREE.InstancedMesh ||
      Array.isArray(child.material) ||
      child.children.length > 0 ||
      !looksLikeWheel(child, root)
    ) {
      return;
    }
    child.userData[VEHICLE_WHEEL_FLAG] = true;
    const painted = !isWheelNode(child, root);
    const rigid = isRigidRunningGear(child);
    const key = [
      (child.material as THREE.Material).uuid,
      painted,
      rigid,
      geometrySignature(child.geometry),
    ].join("|");
    const group = groups.get(key) ?? { meshes: [], painted, rigid };
    group.meshes.push(child);
    groups.set(key, group);
  });
  for (const { meshes, painted, rigid } of groups.values()) {
    const first = meshes[0];
    if (first === undefined || meshes.length < 2) {
      continue;
    }
    let bakeable = true;
    const geometries = meshes.map((mesh) => {
      const matrix = new THREE.Matrix4().multiplyMatrices(
        toRoot,
        mesh.matrixWorld,
      );
      const geometry = mesh.geometry.clone().applyMatrix4(matrix);
      if (matrix.determinant() < 0 && !flipWinding(geometry)) {
        bakeable = false;
      }
      return geometry;
    });
    const merged = bakeable ? mergeGeometries(geometries, false) : null;
    for (const geometry of geometries) {
      geometry.dispose();
    }
    if (merged === null) {
      continue;
    }
    const mesh = new THREE.Mesh(merged, first.material);
    mesh.name = meshes.map((part) => part.name).join("+");
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    mesh.userData[VEHICLE_WHEEL_FLAG] = true;
    root.add(mesh);
    if (isWheelNode(mesh, root) === painted || isRigidRunningGear(mesh) !== rigid) {
      mesh.removeFromParent();
      merged.dispose();
      continue;
    }
    for (const part of meshes) {
      part.removeFromParent();
    }
  }
}

function looksLikeWheel(mesh: THREE.Object3D, root: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = mesh;
  while (current !== null && current !== root) {
    if (WHEEL_NAME.test(current.name)) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function geometrySignature(geometry: THREE.BufferGeometry): string {
  return [
    geometry.index === null ? "flat" : "indexed",
    ...Object.keys(geometry.attributes).sort(),
    Object.keys(geometry.morphAttributes).length,
  ].join(",");
}

/** A mirrored transform baked into vertices reverses triangle winding. */
function flipWinding(geometry: THREE.BufferGeometry): boolean {
  const index = geometry.index;
  if (index !== null) {
    for (let offset = 0; offset + 2 < index.count; offset += 3) {
      const second = index.getX(offset + 1);
      index.setX(offset + 1, index.getX(offset + 2));
      index.setX(offset + 2, second);
    }
    index.needsUpdate = true;
    return true;
  }
  const attributes = Object.values(geometry.attributes);
  if (!attributes.every((attribute) => attribute instanceof THREE.BufferAttribute)) {
    return false;
  }
  for (const attribute of attributes) {
    for (let offset = 0; offset + 2 < attribute.count; offset += 3) {
      for (let component = 0; component < attribute.itemSize; component += 1) {
        const second = attribute.getComponent(offset + 1, component);
        attribute.setComponent(
          offset + 1,
          component,
          attribute.getComponent(offset + 2, component),
        );
        attribute.setComponent(offset + 2, component, second);
      }
    }
    attribute.needsUpdate = true;
  }
  return true;
}
