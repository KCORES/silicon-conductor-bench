import { assignBuildingVariants } from "./buildingVariantAssigner.js";
import { solveBuildingStrips } from "./buildingStripSolver.js";
import {
  CITY_WORLD_EXTENT,
  DISTRICT_TILE_COUNT,
} from "./cityConstants.js";
import {
  DIRECTIONS,
  DIRECTION_DELTAS,
  directionQuarterTurns,
  localToGlobalTile,
  localToWorldDirection,
  rotateDirection,
  tileKey,
} from "./cityGrid.js";
import { solveRoadNetwork } from "./roadNetworkSolver.js";
import type {
  CardinalDirection,
  CityLayout,
  CityPropPlacement,
  QuarterTurns,
  RoadKind,
  RoadTile,
} from "./cityTypes.js";

export * from "./cityConstants.js";
export * from "./cityGrid.js";
export type * from "./cityTypes.js";

const QUARTER_TURNS = [0, 1, 2, 3] as const;
const BASE_CONNECTIONS: Readonly<
  Record<RoadKind, readonly CardinalDirection[]>
> = {
  straight: ["north", "south"],
  crossing: ["north", "south"],
  corner: ["north", "east"],
  tsplit: ["north", "east", "south"],
  junction: ["north", "east", "south", "west"],
};

export function roadConnections(
  kind: RoadKind,
  quarterTurns: QuarterTurns,
): ReadonlySet<CardinalDirection> {
  return new Set(
    BASE_CONNECTIONS[kind].map((direction) =>
      rotateDirection(direction, quarterTurns),
    ),
  );
}

export function buildingQuarterTurns(
  facing: CardinalDirection,
): QuarterTurns {
  return directionQuarterTurns(facing);
}

export function createCityLayout(seed = 0x5f3759df): CityLayout {
  const baseTiles: CityLayout["baseTiles"][number][] = [];
  const roadTiles: RoadTile[] = [];
  const buildingTiles: CityLayout["buildingTiles"][number][] = [];
  const civicTiles: CityLayout["civicTiles"][number][] = [];
  const props: CityPropPlacement[] = [];
  const districts: CityLayout["districts"][number][] = [];
  let buildingSlotOffset = 0;
  const buildingModelCounts = new Map<string, number>();

  for (const signX of [-1, 1] as const) {
    for (const signZ of [-1, 1] as const) {
      const districtSeed =
        seed +
        (signX > 0 ? 0x9e3779b9 : 0) +
        (signZ > 0 ? 0x85ebca6b : 0);
      const roadNetwork = solveRoadNetwork(districtSeed);
      const strips = solveBuildingStrips(roadNetwork.roads);
      const assigned = assignBuildingVariants(
        strips.slots,
        districtSeed,
        buildingSlotOffset,
        buildingModelCounts,
      );
      buildingSlotOffset += strips.slots.length;

      for (let localX = 0; localX < DISTRICT_TILE_COUNT; localX += 1) {
        for (let localZ = 0; localZ < DISTRICT_TILE_COUNT; localZ += 1) {
          const global = localToGlobalTile(localX, localZ, signX, signZ);
          if (!roadNetwork.roads.has(tileKey(localX, localZ))) {
            baseTiles.push(global);
            continue;
          }
          const connections = connectedDirections(
            roadNetwork.roads,
            localX,
            localZ,
            signX,
            signZ,
          );
          roadTiles.push(
            classifyRoadTile(
              global.tileX,
              global.tileZ,
              connections,
              localX === 0 || localZ === 0,
            ),
          );
        }
      }

      for (const { slot, spec } of assigned) {
        const localCenterX =
          slot.minLocalX + (slot.lotWidthTiles - 1) / 2;
        const localCenterZ =
          slot.minLocalZ + (slot.lotDepthTiles - 1) / 2;
        const global = localToGlobalTile(
          localCenterX,
          localCenterZ,
          signX,
          signZ,
        );
        const facing = localToWorldDirection(slot.facing, signX, signZ);
        buildingTiles.push({
          ...global,
          kit: spec.kit,
          modelId: spec.modelId,
          templateKey: spec.templateKey,
          quarterTurns: buildingQuarterTurns(facing),
          modelQuarterTurns: spec.modelQuarterTurns,
          targetScale: spec.targetScale,
          lotWidthTiles: slot.lotWidthTiles,
          lotDepthTiles: slot.lotDepthTiles,
          frontage: slot.frontage,
        });
      }

      for (const civic of strips.civicSlots) {
        const global = localToGlobalTile(
          civic.minLocalX + (civic.widthTiles - 1) / 2,
          civic.minLocalZ + (civic.depthTiles - 1) / 2,
          signX,
          signZ,
        );
        civicTiles.push({
          ...global,
          kind: civic.kind,
          widthTiles: civic.widthTiles,
          depthTiles: civic.depthTiles,
          quarterTurns: signX === signZ ? 0 : 2,
        });
      }

      props.push(
        ...createDistrictProps(
          signX,
          signZ,
          roadNetwork.roads,
          districtSeed,
        ),
      );
      districts.push({
        signX,
        signZ,
        entries: roadNetwork.diagnostics.entries,
        candidateCount: roadNetwork.diagnostics.candidateCount,
        iterationCount: roadNetwork.diagnostics.iterationCount,
        maxGapTiles: strips.maxGapTiles,
        maxBuildingRows: strips.maxBuildingRows,
        usedCivicFallback: strips.civicSlots.length > 0,
      });
    }
  }

  return {
    baseTiles,
    roadTiles,
    buildingTiles,
    civicTiles,
    props,
    districts,
    worldExtent: CITY_WORLD_EXTENT,
  };
}

function connectedDirections(
  roads: ReadonlySet<string>,
  localX: number,
  localZ: number,
  signX: -1 | 1,
  signZ: -1 | 1,
): ReadonlySet<CardinalDirection> {
  const result = new Set<CardinalDirection>();
  for (const direction of DIRECTIONS) {
    const [deltaX, deltaZ] = DIRECTION_DELTAS[direction];
    if (roads.has(tileKey(localX + deltaX, localZ + deltaZ))) {
      result.add(localToWorldDirection(direction, signX, signZ));
    }
  }
  return result;
}

function classifyRoadTile(
  tileX: number,
  tileZ: number,
  connections: ReadonlySet<CardinalDirection>,
  crossing: boolean,
): RoadTile {
  if (connections.size >= 4) {
    return { tileX, tileZ, kind: "junction", quarterTurns: 0 };
  }
  if (connections.size === 3) {
    return {
      tileX,
      tileZ,
      kind: "tsplit",
      quarterTurns: findMatchingRotation("tsplit", connections),
    };
  }
  if (connections.size === 2) {
    const values = [...connections];
    const first = values[0] ?? "north";
    const second = values[1] ?? "south";
    const opposite =
      Math.abs(DIRECTIONS.indexOf(first) - DIRECTIONS.indexOf(second)) === 2;
    const kind: RoadKind = opposite
      ? crossing
        ? "crossing"
        : "straight"
      : "corner";
    return {
      tileX,
      tileZ,
      kind,
      quarterTurns: findMatchingRotation(kind, connections),
    };
  }
  const only = [...connections][0] ?? "north";
  const vertical = only === "north" || only === "south";
  const kind: RoadKind = crossing ? "crossing" : "straight";
  return {
    tileX,
    tileZ,
    kind,
    quarterTurns: findMatchingRotation(
      kind,
      new Set<CardinalDirection>(
        vertical ? ["north", "south"] : ["east", "west"],
      ),
    ),
  };
}

function findMatchingRotation(
  kind: RoadKind,
  target: ReadonlySet<CardinalDirection>,
): QuarterTurns {
  for (const turns of QUARTER_TURNS) {
    const candidate = roadConnections(kind, turns);
    if (
      candidate.size === target.size &&
      [...candidate].every((direction) => target.has(direction))
    ) {
      return turns;
    }
  }
  return 0;
}

function createDistrictProps(
  signX: -1 | 1,
  signZ: -1 | 1,
  roads: ReadonlySet<string>,
  seed: number,
): readonly CityPropPlacement[] {
  const kinds = ["streetlight", "hydrant"] as const;
  const heights = [3.2, 0.55] as const;
  const roadPositions: Array<readonly [number, number]> = [];
  for (const key of roads) {
    const [x, z] = key.split(":").map(Number);
    if (x !== undefined && z !== undefined && x > 1 && z > 1) {
      roadPositions.push([x, z]);
    }
  }
  roadPositions.sort(
    ([leftX, leftZ], [rightX, rightZ]) =>
      hash(leftX, leftZ, seed) - hash(rightX, rightZ, seed),
  );
  return kinds.flatMap((kind, index) => {
    const position = roadPositions[index * 17];
    const targetHeight = heights[index];
    if (position === undefined || targetHeight === undefined) {
      return [];
    }
    const [localX, localZ] = position;
    const global = localToGlobalTile(localX, localZ, signX, signZ);
    return [
      {
        ...global,
        kind,
        offsetX: 0.72 * signX,
        offsetZ: 0.72 * signZ,
        quarterTurns: (index % 4) as QuarterTurns,
        targetHeight,
      },
    ];
  });
}

function hash(x: number, z: number, seed: number): number {
  let value = Math.imul(x + 1, 0x45d9f3b) ^ Math.imul(z + 1, 0x119de1f3) ^ seed;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}
