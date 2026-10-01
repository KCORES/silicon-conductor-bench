/**
 * Infinitown city generation core (restored from Little Workshop demo bundle).
 *
 * Source mapping:
 * - module-050.js  -> GlobalConfig
 * - module-048.js  -> Table (9x9 block grid + random city blocks)
 * - ChunksScene    -> src/module/scene/ChunksScene.js
 * - SceneManager   -> src/module/scene/SceneManager.js (refreshChunkScene)
 *
 * Original demo: https://demos.littleworkshop.fr/infinitown
 */

export const GlobalConfig = {
  FPS: false,
  LOG_CALLS: false,
  RANDOM_SEED: 'infinitown',
  RANDOM_SEED_ENABLED: false,
  MAX_PIXEL_RATIO: 1.25,
  SHADOWMAP_RESOLUTION: typeof window !== 'undefined' && window.isMobile ? 1024 : 2048,
  SHADOWMAP_TYPE: 'SHADOWMAP_TYPE_PCF',
  TABLE_SIZE: 9,
  CHUNK_COUNT: 9,
  CHUNK_SIZE: 60,
  CAMERA_ANGLE: 0.5,
  PAN_SPEED: typeof window !== 'undefined' && window.isMobile ? 0.4 : 0.1,
  FOG_NEAR: 225,
  FOG_FAR: 325,
  FOG_COLOR: 0xa2e8ff,
  DEBUG: false,
};

/**
 * Wrap grid coordinates into the finite 9x9 lookup table.
 */
export function wrapTableCoord(value, tableSize = GlobalConfig.TABLE_SIZE) {
  let v = value % tableSize;
  if (v < 0) v = tableSize + v;
  return v;
}

/**
 * Infinite-city illusion:
 * 1. Pre-generate TABLE_SIZE x TABLE_SIZE random city chunks once.
 * 2. When the camera moves, reuse chunks via modulo lookup instead of creating new geometry.
 *
 * See SceneManager.refreshChunkScene() in src/module/scene/SceneManager.js.
 */
export function describeInfiniteCityAlgorithm() {
  return {
    gridSize: GlobalConfig.TABLE_SIZE,
    chunkWorldSize: GlobalConfig.CHUNK_SIZE,
    visibleChunkRing: GlobalConfig.CHUNK_COUNT,
    blockTypes: 'Fixed Blender-exported block/intersection/lane prefabs from assets/scenes/main.json',
    terrain: 'Flat ground per chunk; roads/lanes/intersections are merged BufferGeometry pieces',
    buildings: 'Random block prefab per table cell, with neighbor dedup + single stadium rule',
    vehicles: 'Optional cars spawned on lanes with chunk-wrap logic (see src/module/model/Car.js)',
  };
}

// Full readable implementations live under:
// - src/module/model/Table.js
// - src/module/scene/ChunksScene.js
// - src/module/scene/SceneManager.js
// - extracted/modules/module-048.js (original minified Table)
// - extracted/modules/module-050.js (original minified GlobalConfig)
