import { describe, expect, it } from "vitest";
import {
  KIT_TARGET_SHARES,
  assignBuildingVariants,
  normalizedSlotDistance,
  preferredHeightForSlot,
} from "../apps/replay/src/scene/city/buildingVariantAssigner.js";
import { solveBuildingStrips } from "../apps/replay/src/scene/city/buildingStripSolver.js";
import {
  BUILDING_SETBACK_TILES,
  DISTRICT_TILE_COUNT,
  FRONTAGE_DEPTH_TILES,
  MIN_ENTRY_MARGIN,
} from "../apps/replay/src/scene/city/cityConstants.js";
import { DIRECTION_DELTAS, tileKey } from "../apps/replay/src/scene/city/cityGrid.js";
import { solveRoadNetwork } from "../apps/replay/src/scene/city/roadNetworkSolver.js";

describe("constrained district solvers", () => {
  it("maps lots from a high-rise core to a low-rise edge", () => {
    const createSlot = (minLocalX: number, minLocalZ: number) => ({
      minLocalX,
      minLocalZ,
      lotWidthTiles: 2,
      lotDepthTiles: 2,
      facing: "north" as const,
      frontage: "internal" as const,
    });
    const core = createSlot(2, 2);
    const middle = createSlot(15, 15);
    const edge = createSlot(29, 29);

    expect(normalizedSlotDistance(core)).toBeLessThan(
      normalizedSlotDistance(middle),
    );
    expect(normalizedSlotDistance(middle)).toBeLessThan(
      normalizedSlotDistance(edge),
    );
    expect(preferredHeightForSlot(core)).toBeGreaterThan(0.9);
    expect(preferredHeightForSlot(middle)).toBeCloseTo(0.5, 1);
    expect(preferredHeightForSlot(edge)).toBeLessThan(0.05);
  });

  it("refuses low-rise models on lots that prefer a high-rise", () => {
    const network = solveRoadNetwork(29);
    const result = solveBuildingStrips(network.roads);
    const assigned = assignBuildingVariants(result.slots, 29);
    const core = assigned.filter(
      ({ slot }) => preferredHeightForSlot(slot) >= 2 / 3,
    );
    const edge = assigned.filter(
      ({ slot }) => preferredHeightForSlot(slot) <= 1 / 3,
    );
    expect(core.length).toBeGreaterThan(0);
    expect(edge.length).toBeGreaterThan(0);
    expect(core.every(({ spec }) => spec.heightTier === "high")).toBe(true);
    expect(edge.some(({ spec }) => spec.heightTier === "low")).toBe(true);
    expect(edge.every(({ spec }) => spec.heightTier !== "high")).toBe(true);
  });

  it("faces the main road when a lot touches it", () => {
    const network = solveRoadNetwork(29);
    const result = solveBuildingStrips(network.roads);
    const mainLots = result.slots.filter(
      (slot) =>
        slot.minLocalX === BUILDING_SETBACK_TILES ||
        slot.minLocalZ === BUILDING_SETBACK_TILES,
    );
    expect(mainLots.length).toBeGreaterThan(0);
    for (const slot of mainLots) {
      expect(
        (slot.minLocalX === BUILDING_SETBACK_TILES &&
          slot.facing === "west") ||
          (slot.minLocalZ === BUILDING_SETBACK_TILES &&
            slot.facing === "south"),
      ).toBe(true);
      expect(slot.frontage).toBe("main");
    }
  });

  it("allows only perpendicular roads through the frontage buffer", () => {
    const network = solveRoadNetwork(17);
    const xEntries = new Set(
      network.diagnostics.entries
        .filter((entry) => entry.edge === "x")
        .map((entry) => entry.localZ),
    );
    const zEntries = new Set(
      network.diagnostics.entries
        .filter((entry) => entry.edge === "z")
        .map((entry) => entry.localX),
    );
    let foundInteriorParallelRoad = false;
    for (const key of network.roads) {
      const [localX = 0, localZ = 0] = key.split(":").map(Number);
      if (localX < FRONTAGE_DEPTH_TILES) {
        expect(xEntries.has(localZ)).toBe(true);
      }
      if (localZ < FRONTAGE_DEPTH_TILES) {
        expect(zEntries.has(localX)).toBe(true);
      }
      if (
        localX !== MIN_ENTRY_MARGIN &&
        localZ >= MIN_ENTRY_MARGIN &&
        network.roads.has(tileKey(localX, localZ - 1)) &&
        network.roads.has(tileKey(localX, localZ + 1))
      ) {
        foundInteriorParallelRoad = true;
      }
    }
    expect(foundInteriorParallelRoad).toBe(true);
  });

  it("produces one connected internal network", () => {
    const network = solveRoadNetwork(19);
    const start = network.roads.values().next().value as string | undefined;
    expect(start).toBeDefined();
    const visited = new Set<string>(start === undefined ? [] : [start]);
    const queue = start === undefined ? [] : [start];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) {
        continue;
      }
      const [x = 0, z = 0] = current.split(":").map(Number);
      for (const [deltaX, deltaZ] of Object.values(DIRECTION_DELTAS)) {
        const next = tileKey(x + deltaX, z + deltaZ);
        if (network.roads.has(next) && !visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    expect(visited.size).toBe(network.roads.size);
  });

  it("packs accessible lots and fills every residual tile municipally", () => {
    const network = solveRoadNetwork(23);
    const result = solveBuildingStrips(network.roads);
    const occupied = new Set<string>();
    for (const slot of result.slots) {
      for (let x = 0; x < slot.lotWidthTiles; x += 1) {
        for (let z = 0; z < slot.lotDepthTiles; z += 1) {
          const key = tileKey(slot.minLocalX + x, slot.minLocalZ + z);
          expect(network.roads.has(key)).toBe(false);
          expect(occupied.has(key)).toBe(false);
          occupied.add(key);
        }
      }
    }
    for (const civic of result.civicSlots) {
      for (let z = 0; z < civic.depthTiles; z += 1) {
        const key = tileKey(civic.minLocalX, civic.minLocalZ + z);
        expect(network.roads.has(key)).toBe(false);
        expect(occupied.has(key)).toBe(false);
        occupied.add(key);
      }
    }
    for (let x = 0; x < DISTRICT_TILE_COUNT; x += 1) {
      for (let z = 0; z < DISTRICT_TILE_COUNT; z += 1) {
        const key = tileKey(x, z);
        if (
          x < BUILDING_SETBACK_TILES ||
          z < BUILDING_SETBACK_TILES ||
          isPedestrianCornerApronTile(x, z)
        ) {
          expect(occupied.has(key)).toBe(false);
        } else {
          expect(occupied.has(key) || network.roads.has(key)).toBe(true);
        }
      }
    }
    expect(
      result.slots.some(
        (slot) => slot.lotWidthTiles > 2 || slot.lotDepthTiles > 2,
      ),
    ).toBe(true);
  });

  it("mixes all kits and avoids identical adjacent models", () => {
    const network = solveRoadNetwork(29);
    const result = solveBuildingStrips(network.roads);
    const assigned = assignBuildingVariants(result.slots, 29);
    expect(assignBuildingVariants(result.slots, 29)).toEqual(assigned);
    expect(new Set(assigned.map(({ spec }) => spec.kit))).toEqual(
      new Set([
        "city-builder",
        "suburban",
        "industrial",
        "commercial",
        "simplepoly-city",
        "simplepoly-urban",
      ]),
    );
    for (const [kit, share] of Object.entries(KIT_TARGET_SHARES)) {
      const count = assigned.filter(({ spec }) => spec.kit === kit).length;
      expect(
        Math.abs(count - assigned.length * share),
        `${kit} should remain within one building of its target share`,
      ).toBeLessThanOrEqual(1);
    }
    for (const [index, left] of assigned.entries()) {
      for (const right of assigned.slice(index + 1)) {
        if (areAdjacent(left.slot, right.slot)) {
          expect(right.spec.id).not.toBe(left.spec.id);
        }
      }
    }
  });
});

function isPedestrianCornerApronTile(x: number, z: number): boolean {
  return (
    (x === BUILDING_SETBACK_TILES && z <= 3) ||
    (z === BUILDING_SETBACK_TILES && x <= 3)
  );
}

function areAdjacent(
  left: {
    minLocalX: number;
    minLocalZ: number;
    lotWidthTiles: number;
    lotDepthTiles: number;
  },
  right: {
    minLocalX: number;
    minLocalZ: number;
    lotWidthTiles: number;
    lotDepthTiles: number;
  },
): boolean {
  const leftMaxX = left.minLocalX + left.lotWidthTiles;
  const leftMaxZ = left.minLocalZ + left.lotDepthTiles;
  const rightMaxX = right.minLocalX + right.lotWidthTiles;
  const rightMaxZ = right.minLocalZ + right.lotDepthTiles;
  const overlapsX =
    left.minLocalX < rightMaxX && right.minLocalX < leftMaxX;
  const overlapsZ =
    left.minLocalZ < rightMaxZ && right.minLocalZ < leftMaxZ;
  return (
    (overlapsX &&
      (leftMaxZ === right.minLocalZ || rightMaxZ === left.minLocalZ)) ||
    (overlapsZ &&
      (leftMaxX === right.minLocalX || rightMaxX === left.minLocalX))
  );
}
