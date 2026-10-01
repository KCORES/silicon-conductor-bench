import {
  DISTRICT_TILE_COUNT,
  FRONTAGE_DEPTH_TILES,
  MIN_ENTRY_MARGIN,
  MIN_ENTRY_SPACING,
  ROAD_SOLVER_BEAM_WIDTH,
  ROAD_SOLVER_MAX_CANDIDATES,
  ROAD_SOLVER_MAX_ITERATIONS,
} from "./cityConstants.js";
import { isLocalTile, tileKey } from "./cityGrid.js";
import type {
  LocalRoadNetwork,
  MainRoadEntry,
} from "./cityTypes.js";

interface RoadCandidate {
  readonly roads: ReadonlySet<string>;
  readonly score: number;
  readonly ordinal: number;
}

export function solveRoadNetwork(seed: number): LocalRoadNetwork {
  const entryIndices = selectEntryIndices(DISTRICT_TILE_COUNT);
  const entries: MainRoadEntry[] = entryIndices.flatMap((index) => [
    { edge: "x", localX: 0, localZ: index },
    { edge: "z", localX: index, localZ: 0 },
  ]);
  const candidates: RoadCandidate[] = [];
  const offsets = [0, seed % 2 === 0 ? -1 : 1, seed % 2 === 0 ? 1 : -1];
  let candidateCount = 0;
  let iterationCount = 0;

  for (
    let iteration = 0;
    iteration < offsets.length &&
    iteration < ROAD_SOLVER_MAX_ITERATIONS &&
    candidateCount < ROAD_SOLVER_MAX_CANDIDATES;
    iteration += 1
  ) {
    const offset = offsets[iteration] ?? 0;
    const roads = createCandidateRoads(entryIndices, offset);
    candidates.push({
      roads,
      score: scoreRoadCoverage(roads),
      ordinal: iteration,
    });
    candidates.sort(
      (left, right) =>
        left.score - right.score || left.ordinal - right.ordinal,
    );
    if (candidates.length > ROAD_SOLVER_BEAM_WIDTH) {
      candidates.length = ROAD_SOLVER_BEAM_WIDTH;
    }
    candidateCount += 1;
    iterationCount += 1;
  }

  const best = candidates[0];
  if (best === undefined) {
    throw new Error("Road solver produced no bounded candidate");
  }
  return {
    roads: best.roads,
    diagnostics: { entries, candidateCount, iterationCount },
  };
}

export function selectEntryIndices(blockLength: number): readonly number[] {
  const minimum = MIN_ENTRY_MARGIN;
  const maximum = blockLength - MIN_ENTRY_MARGIN;
  const indices: number[] = [];
  for (let index = minimum; index <= maximum; index += MIN_ENTRY_SPACING) {
    indices.push(index);
  }
  if (indices.length === 0 && minimum <= maximum) {
    indices.push(minimum);
  }
  return indices;
}

function createCandidateRoads(
  entryIndices: readonly number[],
  interiorOffset: number,
): ReadonlySet<string> {
  const roads = new Set<string>();
  const last = DISTRICT_TILE_COUNT - 1;

  for (const index of entryIndices) {
    carve(roads, 0, index, last, index);
    carve(roads, index, 0, index, last);
  }

  const firstInterior = entryIndices[0] ?? MIN_ENTRY_MARGIN;
  const lastInterior = entryIndices.at(-1) ?? firstInterior;
  const middle =
    Math.floor((firstInterior + lastInterior) / 2) + interiorOffset;
  if (
    middle >= FRONTAGE_DEPTH_TILES &&
    !entryIndices.includes(middle)
  ) {
    carve(roads, middle, firstInterior, middle, lastInterior);
    carve(roads, firstInterior, middle, lastInterior, middle);
  }
  return roads;
}

function carve(
  roads: Set<string>,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
): void {
  const deltaX = Math.sign(toX - fromX);
  const deltaZ = Math.sign(toZ - fromZ);
  const length = Math.max(Math.abs(toX - fromX), Math.abs(toZ - fromZ));
  for (let step = 0; step <= length; step += 1) {
    const localX = fromX + deltaX * step;
    const localZ = fromZ + deltaZ * step;
    if (isLocalTile(localX, localZ)) {
      roads.add(tileKey(localX, localZ));
    }
  }
}

function scoreRoadCoverage(roads: ReadonlySet<string>): number {
  let score = roads.size * 0.03;
  for (let localX = 0; localX < DISTRICT_TILE_COUNT; localX += 1) {
    for (let localZ = 0; localZ < DISTRICT_TILE_COUNT; localZ += 1) {
      if (roads.has(tileKey(localX, localZ))) {
        continue;
      }
      score += distanceToRoad(roads, localX, localZ) ** 2;
    }
  }
  return score;
}

function distanceToRoad(
  roads: ReadonlySet<string>,
  localX: number,
  localZ: number,
): number {
  for (let distance = 1; distance < DISTRICT_TILE_COUNT; distance += 1) {
    for (let offset = 0; offset <= distance; offset += 1) {
      const other = distance - offset;
      for (const [deltaX, deltaZ] of [
        [offset, other],
        [offset, -other],
        [-offset, other],
        [-offset, -other],
      ] as const) {
        if (roads.has(tileKey(localX + deltaX, localZ + deltaZ))) {
          return distance;
        }
      }
    }
  }
  return DISTRICT_TILE_COUNT;
}
