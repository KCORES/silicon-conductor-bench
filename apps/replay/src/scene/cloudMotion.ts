/** Motion copied from Infinitown's Cloud.js. Movement there is once per frame. */
export const CLOUD_DIRECTION_X = -1;
export const CLOUD_DIRECTION_Z = 0.3;
export const CLOUD_ALTITUDE = 60;
export const CLOUD_YAW = 0.25;
export const CLOUD_SCALE_RATIO = 0.05;
export const CLOUD_PLANET_SPEED = 2;
export const CLOUD_BASE_FRAME_SPEED = 0.05;
export const CLOUD_REFERENCE_FRAME_RATE = 60;
export const CLOUD_CHUNK_SIZE = 60;
export const CLOUD_SPAWN_THRESHOLD = 0.65;
export const CLOUD_RANDOM_SEED = 0x1f1700;

export interface CloudSpawn {
  readonly x: number;
  readonly z: number;
  readonly delay: number;
  readonly speedModifier: number;
  readonly prefabIndex: number;
}

export interface CloudFieldLayout {
  readonly chunkCount: number;
  readonly halfSpan: number;
  readonly spawns: readonly CloudSpawn[];
}

export interface CloudStep {
  readonly x: number;
  readonly z: number;
  readonly scale: number;
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Odd chunk grid covering the city. Infinitown scrolls a 9×9 table; this camera stays put. */
export function cloudChunkCount(extent: number): number {
  const covered = Math.ceil((Math.max(extent, 0) * 2) / CLOUD_CHUNK_SIZE);
  const odd = covered % 2 === 0 ? covered + 1 : covered;
  return Math.max(1, odd);
}

export function cloudHalfSpan(chunkCount: number): number {
  return (chunkCount * CLOUD_CHUNK_SIZE) / 2;
}

export function createCloudSpawns(
  extent: number,
  random: () => number,
  prefabCount: number,
): CloudFieldLayout {
  const chunkCount = cloudChunkCount(extent);
  const halfSpan = cloudHalfSpan(chunkCount);
  const half = (chunkCount - 1) / 2;
  const spawns: CloudSpawn[] = [];
  if (prefabCount <= 0) {
    return { chunkCount, halfSpan, spawns };
  }
  for (let iz = -half; iz <= half; iz += 1) {
    for (let ix = -half; ix <= half; ix += 1) {
      if (random() <= CLOUD_SPAWN_THRESHOLD) {
        continue;
      }
      const prefabIndex = Math.min(
        prefabCount - 1,
        Math.floor(random() * prefabCount),
      );
      const x = ix * CLOUD_CHUNK_SIZE + random() * CLOUD_CHUNK_SIZE - CLOUD_CHUNK_SIZE / 2;
      const z = iz * CLOUD_CHUNK_SIZE + random() * CLOUD_CHUNK_SIZE - CLOUD_CHUNK_SIZE / 2;
      const delay = 5 * random();
      const speedModifier = 0.25 * random() + 1;
      spawns.push({ x, z, delay, speedModifier, prefabIndex });
    }
  }
  return { chunkCount, halfSpan, spawns };
}

export function cloudScale(delay: number, elapsed: number): number {
  const wave = Math.sin((delay + elapsed) * CLOUD_PLANET_SPEED);
  const blend = (wave + 1) / 2;
  const minScale = 1 - CLOUD_SCALE_RATIO;
  const maxScale = 1 + CLOUD_SCALE_RATIO;
  return minScale + (maxScale - minScale) * blend;
}

export function wrapCloudAxis(value: number, halfSpan: number): number {
  const span = halfSpan * 2;
  if (span <= 0) {
    return value;
  }
  const offset = value + halfSpan;
  return ((offset % span) + span) % span - halfSpan;
}

export function stepCloud(input: {
  readonly x: number;
  readonly z: number;
  readonly delay: number;
  readonly speedModifier: number;
  readonly elapsed: number;
  readonly deltaSeconds: number;
  readonly halfSpan: number;
}): CloudStep {
  const distance =
    CLOUD_BASE_FRAME_SPEED *
    input.speedModifier *
    CLOUD_REFERENCE_FRAME_RATE *
    input.deltaSeconds;
  return {
    x: wrapCloudAxis(input.x + CLOUD_DIRECTION_X * distance, input.halfSpan),
    z: wrapCloudAxis(input.z + CLOUD_DIRECTION_Z * distance, input.halfSpan),
    scale: cloudScale(input.delay, input.elapsed),
  };
}
