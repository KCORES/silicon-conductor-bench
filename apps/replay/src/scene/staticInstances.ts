import * as THREE from "three";

export interface ShadowFlags {
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
}

export interface InstanceBatch {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  castShadow: boolean;
  receiveShadow: boolean;
  matrices: THREE.Matrix4[];
}

const savedPosition = new THREE.Vector3();
const savedQuaternion = new THREE.Quaternion();
const savedScale = new THREE.Vector3();

export function placeTemplate(
  batches: Map<string, InstanceBatch>,
  template: THREE.Object3D,
  place: (root: THREE.Object3D) => void,
  shadows: ShadowFlags,
): void {
  savedPosition.copy(template.position);
  savedQuaternion.copy(template.quaternion);
  savedScale.copy(template.scale);
  place(template);
  template.updateMatrixWorld(true);
  template.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || Array.isArray(child.material)) {
      return;
    }
    const key = [
      child.geometry.uuid,
      child.material.uuid,
      shadows.castShadow ? "cast" : "nocast",
      shadows.receiveShadow ? "receive" : "noreceive",
    ].join("|");
    let batch = batches.get(key);
    if (batch === undefined) {
      batch = {
        geometry: child.geometry,
        material: child.material,
        castShadow: shadows.castShadow,
        receiveShadow: shadows.receiveShadow,
        matrices: [],
      };
      batches.set(key, batch);
    }
    batch.matrices.push(child.matrixWorld.clone());
  });
  template.position.copy(savedPosition);
  template.quaternion.copy(savedQuaternion);
  template.scale.copy(savedScale);
  template.updateMatrixWorld(true);
}

export function fitRootToHeight(root: THREE.Object3D, targetHeight: number): void {
  root.scale.set(1, 1, 1);
  root.updateMatrixWorld(true);
  const size = new THREE.Vector3();
  new THREE.Box3().setFromObject(root).getSize(size);
  root.scale.setScalar(targetHeight / Math.max(size.y, 0.001));
}

export function createInstancedMeshes(
  batches: Iterable<InstanceBatch>,
): THREE.InstancedMesh[] {
  const meshes: THREE.InstancedMesh[] = [];
  for (const batch of batches) {
    if (batch.matrices.length === 0) {
      continue;
    }
    const mesh = new THREE.InstancedMesh(
      batch.geometry,
      batch.material,
      batch.matrices.length,
    );
    mesh.castShadow = batch.castShadow;
    mesh.receiveShadow = batch.receiveShadow;
    for (let index = 0; index < batch.matrices.length; index += 1) {
      const matrix = batch.matrices[index];
      if (matrix !== undefined) {
        mesh.setMatrixAt(index, matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    meshes.push(mesh);
  }
  return meshes;
}
