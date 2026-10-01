import {
  BUILDING_SETBACK_TILES,
  DISTRICT_TILE_COUNT,
} from "./cityConstants.js";
import { tileKey } from "./cityGrid.js";
import type {
  BuildingSlot,
  CardinalDirection,
  CivicKind,
} from "./cityTypes.js";

export interface LocalCivicSlot {
  readonly minLocalX: number;
  readonly minLocalZ: number;
  readonly widthTiles: 1;
  readonly depthTiles: 1 | 2;
  readonly kind: CivicKind;
}

export interface BuildingStripResult {
  readonly slots: readonly BuildingSlot[];
  readonly civicSlots: readonly LocalCivicSlot[];
  readonly maxGapTiles: number;
  readonly maxBuildingRows: number;
}

const LOT_SHAPES = [
  [5, 5],
  [5, 4],
  [4, 5],
  [5, 3],
  [4, 4],
  [4, 3],
  [3, 4],
  [3, 3],
] as const;

const FACINGS = ["west", "south", "east", "north"] as const;

export function solveBuildingStrips(
  roads: ReadonlySet<string>,
): BuildingStripResult {
  const occupied = new Set<string>();
  const slots: BuildingSlot[] = [];
  const candidates = createCandidates(roads);

  for (const candidate of candidates) {
    const tiles = slotTiles(candidate);
    if (tiles.some(([x, z]) => occupied.has(tileKey(x, z)))) {
      continue;
    }
    for (const [x, z] of tiles) {
      occupied.add(tileKey(x, z));
    }
    slots.push(candidate);
  }

  const civicSlots = createCivicSlots(roads, occupied);
  return {
    slots,
    civicSlots,
    maxGapTiles: 0,
    maxBuildingRows: 2,
  };
}

function createCandidates(
  roads: ReadonlySet<string>,
): BuildingSlot[] {
  const candidates: BuildingSlot[] = [];
  for (const [lotWidthTiles, lotDepthTiles] of LOT_SHAPES) {
    for (
      let minLocalX = BUILDING_SETBACK_TILES;
      minLocalX <= DISTRICT_TILE_COUNT - lotWidthTiles;
      minLocalX += 1
    ) {
      for (
        let minLocalZ = BUILDING_SETBACK_TILES;
        minLocalZ <= DISTRICT_TILE_COUNT - lotDepthTiles;
        minLocalZ += 1
      ) {
        if (
          !slotTiles({
            minLocalX,
            minLocalZ,
            lotWidthTiles,
            lotDepthTiles,
          }).every(
            ([x, z]) =>
              !roads.has(tileKey(x, z)) &&
              !isPedestrianCornerApronTile(x, z),
          )
        ) {
          continue;
        }
        const facings = streetFacings(
          roads,
          minLocalX,
          minLocalZ,
          lotWidthTiles,
          lotDepthTiles,
        );
        const facing = facings[0];
        if (facing === undefined) {
          continue;
        }
        const frontage =
          (facing === "west" && minLocalX === BUILDING_SETBACK_TILES) ||
          (facing === "south" && minLocalZ === BUILDING_SETBACK_TILES)
            ? "main"
            : "internal";
        candidates.push({
          minLocalX,
          minLocalZ,
          lotWidthTiles,
          lotDepthTiles,
          facing,
          frontage,
        });
      }
    }
  }
  candidates.sort((left, right) => {
    const frontage =
      (left.frontage === "main" ? 0 : 1) -
      (right.frontage === "main" ? 0 : 1);
    const area =
      right.lotWidthTiles * right.lotDepthTiles -
      left.lotWidthTiles * left.lotDepthTiles;
    return (
      frontage ||
      area ||
      left.minLocalX + left.minLocalZ -
        (right.minLocalX + right.minLocalZ) ||
      left.minLocalX - right.minLocalX ||
      FACINGS.indexOf(left.facing) - FACINGS.indexOf(right.facing)
    );
  });
  return candidates;
}

function streetFacings(
  roads: ReadonlySet<string>,
  minX: number,
  minZ: number,
  width: number,
  depth: number,
): CardinalDirection[] {
  const main: CardinalDirection[] = [];
  const internal: CardinalDirection[] = [];
  if (minX === BUILDING_SETBACK_TILES) {
    main.push("west");
  } else if (edgeHasRoad(roads, minX - 1, minZ, 0, 1, depth)) {
    internal.push("west");
  }
  if (minZ === BUILDING_SETBACK_TILES) {
    main.push("south");
  } else if (edgeHasRoad(roads, minX, minZ - 1, 1, 0, width)) {
    internal.push("south");
  }
  if (edgeHasRoad(roads, minX + width, minZ, 0, 1, depth)) {
    internal.push("east");
  }
  if (edgeHasRoad(roads, minX, minZ + depth, 1, 0, width)) {
    internal.push("north");
  }
  return main.length > 0 ? main : internal;
}

function edgeHasRoad(
  roads: ReadonlySet<string>,
  startX: number,
  startZ: number,
  stepX: number,
  stepZ: number,
  length: number,
): boolean {
  for (let offset = 0; offset < length; offset += 1) {
    if (
      !roads.has(
        tileKey(startX + stepX * offset, startZ + stepZ * offset),
      )
    ) {
      return false;
    }
  }
  return true;
}

function slotTiles(
  slot: Pick<
    BuildingSlot,
    "minLocalX" | "minLocalZ" | "lotWidthTiles" | "lotDepthTiles"
  >,
): Array<readonly [number, number]> {
  const result: Array<readonly [number, number]> = [];
  for (let x = 0; x < slot.lotWidthTiles; x += 1) {
    for (let z = 0; z < slot.lotDepthTiles; z += 1) {
      result.push([slot.minLocalX + x, slot.minLocalZ + z]);
    }
  }
  return result;
}

function createCivicSlots(
  roads: ReadonlySet<string>,
  occupied: Set<string>,
): LocalCivicSlot[] {
  const result: LocalCivicSlot[] = [];
  for (let localX = 0; localX < DISTRICT_TILE_COUNT; localX += 1) {
    for (let localZ = 0; localZ < DISTRICT_TILE_COUNT; localZ += 1) {
      const key = tileKey(localX, localZ);
      if (
        localX < BUILDING_SETBACK_TILES ||
        localZ < BUILDING_SETBACK_TILES ||
        isPedestrianCornerApronTile(localX, localZ) ||
        roads.has(key) ||
        occupied.has(key)
      ) {
        continue;
      }
      const nextKey = tileKey(localX, localZ + 1);
      const canPair =
        localZ + 1 < DISTRICT_TILE_COUNT &&
        !isPedestrianCornerApronTile(localX, localZ + 1) &&
        !roads.has(nextKey) &&
        !occupied.has(nextKey);
      occupied.add(key);
      if (canPair) {
        occupied.add(nextKey);
      }
      result.push({
        minLocalX: localX,
        minLocalZ: localZ,
        widthTiles: 1,
        depthTiles: canPair ? 2 : 1,
        kind:
          (localX * 3 + localZ * 5) % 7 === 0
            ? "micro-landmark"
            : canPair
              ? "pocket-park"
              : "greenbelt",
      });
    }
  }
  return result;
}

function isPedestrianCornerApronTile(
  localX: number,
  localZ: number,
): boolean {
  const apronDepth = 3;
  return (
    (localX === BUILDING_SETBACK_TILES && localZ <= apronDepth) ||
    (localZ === BUILDING_SETBACK_TILES && localX <= apronDepth)
  );
}
