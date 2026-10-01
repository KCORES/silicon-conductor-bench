import * as THREE from "three";

interface BoundsLike {
  readonly min: { readonly x: number; readonly y: number; readonly z: number };
  readonly max: { readonly x: number; readonly y: number; readonly z: number };
}

export function vehicleModelPivotOffset(
  bounds: BoundsLike,
  groundY = 0.08,
): { x: number; y: number; z: number } {
  return {
    x: centeredOffset(bounds.min.x, bounds.max.x),
    y: groundY - bounds.min.y,
    z: centeredOffset(bounds.min.z, bounds.max.z),
  };
}

function centeredOffset(min: number, max: number): number {
  const center = (min + max) / 2;
  return center === 0 ? 0 : -center;
}

/**
 * Centers a prepared vehicle model beneath its actor root and seats it on the road.
 * Bounds are measured after the model's catalog scale and quarter-turn are applied.
 */
export function normalizeVehicleModelPivot(
  model: THREE.Object3D,
  groundY = 0.08,
): THREE.Box3 {
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  if (bounds.isEmpty()) {
    return bounds;
  }

  const offset = vehicleModelPivotOffset(bounds, groundY);
  model.position.x += offset.x;
  model.position.y += offset.y;
  model.position.z += offset.z;
  model.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(model);
}
