import {
  CITY_INNER_TILE,
  DISTRICT_TILE_COUNT,
  TILE_SIZE,
} from "./cityConstants.js";
import type {
  CardinalDirection,
  LocalTile,
  QuarterTurns,
} from "./cityTypes.js";

export const DIRECTIONS = ["north", "east", "south", "west"] as const;

export const DIRECTION_DELTAS: Readonly<
  Record<CardinalDirection, readonly [number, number]>
> = {
  north: [0, 1],
  east: [1, 0],
  south: [0, -1],
  west: [-1, 0],
};

export function tileKey(tileX: number, tileZ: number): string {
  return `${tileX}:${tileZ}`;
}

export function parseTileKey(key: string): LocalTile {
  const [x, z] = key.split(":").map(Number);
  return {
    localX: Number.isFinite(x) ? (x ?? 0) : 0,
    localZ: Number.isFinite(z) ? (z ?? 0) : 0,
  };
}

export function isLocalTile(localX: number, localZ: number): boolean {
  return (
    localX >= 0 &&
    localX < DISTRICT_TILE_COUNT &&
    localZ >= 0 &&
    localZ < DISTRICT_TILE_COUNT
  );
}

export function tileToWorld(tileX: number, tileZ: number): {
  readonly x: number;
  readonly z: number;
} {
  return { x: tileX * TILE_SIZE, z: tileZ * TILE_SIZE };
}

export function localToGlobalTile(
  localX: number,
  localZ: number,
  signX: -1 | 1,
  signZ: -1 | 1,
): { readonly tileX: number; readonly tileZ: number } {
  return {
    tileX: signX * (CITY_INNER_TILE + localX),
    tileZ: signZ * (CITY_INNER_TILE + localZ),
  };
}

export function rotateDirection(
  direction: CardinalDirection,
  quarterTurns: QuarterTurns,
): CardinalDirection {
  const index = DIRECTIONS.indexOf(direction);
  return DIRECTIONS[(index + quarterTurns) % DIRECTIONS.length] ?? direction;
}

export function directionQuarterTurns(
  direction: CardinalDirection,
): QuarterTurns {
  return DIRECTIONS.indexOf(direction) as QuarterTurns;
}

export function localToWorldDirection(
  direction: CardinalDirection,
  signX: -1 | 1,
  signZ: -1 | 1,
): CardinalDirection {
  if (direction === "east") {
    return signX > 0 ? "east" : "west";
  }
  if (direction === "west") {
    return signX > 0 ? "west" : "east";
  }
  if (direction === "north") {
    return signZ > 0 ? "north" : "south";
  }
  return signZ > 0 ? "south" : "north";
}

export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}
