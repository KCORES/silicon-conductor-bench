export interface ShadowFrustumInput {
  readonly cameraDistance: number;
  readonly fovDegrees: number;
  readonly aspect: number;
  readonly mapSize: number;
  readonly focusX: number;
  readonly focusZ: number;
  readonly sunDistance: number;
  /** Extra depth toward the light so casters above the ground stay inside the map. */
  readonly casterMargin?: number;
}

export interface ShadowFrustum {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly near: number;
  readonly far: number;
  readonly snappedFocusX: number;
  readonly snappedFocusZ: number;
}

const MIN_HALF_HEIGHT = 16;
const SHADOW_NEAR = 40;

/**
 * Fit an orthographic shadow camera to the current view instead of the whole city.
 * The focus is snapped to shadow texels so the map does not shimmer while orbiting.
 */
export function fitViewShadowFrustum(input: ShadowFrustumInput): ShadowFrustum {
  const halfFov = (input.fovDegrees * Math.PI) / 360;
  const aspect = Math.max(input.aspect, 1);
  const halfHeight = Math.max(
    MIN_HALF_HEIGHT,
    Math.tan(halfFov) * Math.max(input.cameraDistance, 1) * 1.45,
  );
  const halfWidth = halfHeight * aspect;
  const texel = (halfHeight * 2) / Math.max(input.mapSize, 1);
  const snappedFocusX = Math.round(input.focusX / texel) * texel;
  const snappedFocusZ = Math.round(input.focusZ / texel) * texel;
  const reach = Math.max(halfWidth, halfHeight);
  const casterMargin = input.casterMargin ?? 0;
  const near =
    casterMargin > 0
      ? Math.max(1, input.sunDistance - reach - casterMargin)
      : SHADOW_NEAR;
  return {
    left: -halfWidth,
    right: halfWidth,
    top: halfHeight,
    bottom: -halfHeight,
    near,
    far: input.sunDistance + reach + SHADOW_NEAR,
    snappedFocusX,
    snappedFocusZ,
  };
}
