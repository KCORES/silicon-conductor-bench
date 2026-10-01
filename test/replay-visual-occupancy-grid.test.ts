import { describe, expect, it } from "vitest";
import { createRoadNetwork } from "../src/core/network.js";
import { createReplayScene } from "../src/replay/geometry.js";
import type { ReplayPedestrianPose } from "../src/replay/types.js";
import {
  mapCrosswalkPoint,
  mapSimulationPoint,
} from "../apps/replay/src/scene/roadFrame.js";
import { buildTrafficLogicGridIndex } from "../apps/replay/src/scene/trafficLogicGrid.js";
import {
  buildVisualLattice,
  crosswalkHalfCells,
  latticeCellAt,
  paintVisualOccupancy,
} from "../apps/replay/src/scene/visualOccupancyGrid.js";

describe("visual occupancy grid", () => {
  it("shares an edge between adjacent road squares", () => {
    const lattice = buildVisualLattice(createReplayScene(createRoadNetwork()));
    const left = lattice.byKey.get("0:0");
    const right = lattice.byKey.get("1:0");
    expect(left).toBeDefined();
    expect(right).toBeDefined();
    expect(left?.corners[1]).toEqual(right?.corners[0]);
    expect(left?.corners[2]).toEqual(right?.corners[3]);
    expect(lattice.byKey.has("5:5")).toBe(true);
    expect(lattice.byKey.has("6:9")).toBe(true);
    expect(lattice.byKey.has("-6:5")).toBe(true);
  });

  it("places a northbound stop-line point in the square beneath it", () => {
    const lattice = buildVisualLattice(createReplayScene(createRoadNetwork()));
    const pose = mapSimulationPoint(-3, -7, 0);
    const cell = lattice.byKey.get(latticeCellAt(pose.x, pose.z));
    expect(cell).toBeDefined();
    const [southwest, southeast, northeast] = cell?.corners ?? [];
    expect(southwest).toBeDefined();
    expect(southeast).toBeDefined();
    expect(northeast).toBeDefined();
    if (
      southwest === undefined ||
      southeast === undefined ||
      northeast === undefined
    ) {
      return;
    }
    expect(pose.x).toBeGreaterThanOrEqual(southwest.x);
    expect(pose.x).toBeLessThan(southeast.x);
    expect(pose.z).toBeGreaterThanOrEqual(southwest.z);
    expect(pose.z).toBeLessThan(northeast.z);
  });

  it("draws crossing and waiting cells from authoritative geometry", () => {
    const scene = createReplayScene(createRoadNetwork());
    const north = crosswalkHalfCells(scene).filter(
      (cell) => cell.crosswalkId === "CROSSWALK:NORTH",
    );
    const crossing = north.filter((cell) =>
      cell.conflictResourceId.startsWith("CROSSWALK:"),
    );
    const waiting = crosswalkHalfCells(scene).filter((cell) =>
      cell.conflictResourceId.includes(":CELL:"),
    ).filter((cell) =>
      cell.conflictResourceId.startsWith("CORNER:"),
    );
    const entrances = crosswalkHalfCells(scene).filter((cell) =>
      cell.conflictResourceId.includes(":ENTRY:"),
    );
    expect(crossing).toHaveLength(16);
    expect(waiting).toHaveLength(64);
    expect(entrances).toHaveLength(8);
    const row0 = crossing.find((cell) => cell.column === 3 && cell.row === 0);
    const row1 = crossing.find((cell) => cell.column === 3 && cell.row === 1);
    expect(row0).toBeDefined();
    expect(row1).toBeDefined();
    if (row0 === undefined || row1 === undefined) {
      return;
    }
    const shared0 = midpoint(row0.corners[0], row0.corners[3]);
    const shared1 = midpoint(row1.corners[0], row1.corners[3]);
    const between = midpoint(row0.center, row1.center);
    expect(shared0.x).toBeCloseTo(shared1.x);
    expect(shared0.z).toBeCloseTo(shared1.z);
    expect(shared0.x).toBeCloseTo(between.x);
    expect(shared0.z).toBeCloseTo(between.z);
    const gap = Math.hypot(
      row1.center.x - row0.center.x,
      row1.center.z - row0.center.z,
    );
    const reach = Math.hypot(
      shared0.x - row0.center.x,
      shared0.z - row0.center.z,
    );
    expect(reach * 2).toBeCloseTo(gap);
    const source = scene.crosswalks
      .find((crosswalk) => crosswalk.id === "CROSSWALK:NORTH")
      ?.cells?.find((cell) => cell.id === row0.key);
    expect(source).toBeDefined();
    if (source !== undefined) {
      expect(row0.center).toEqual(
        mapCrosswalkPoint(source.x, source.z, "NORTH"),
      );
    }
  });

  it("lights one pedestrian row and both rows of a vehicle column", () => {
    const scene = createReplayScene(createRoadNetwork());
    const index = buildTrafficLogicGridIndex(scene);
    const lattice = buildVisualLattice(scene);
    const halfCells = crosswalkHalfCells(scene);
    const row0 = halfCells.find(
      (cell) =>
        cell.crosswalkId === "CROSSWALK:NORTH" &&
        cell.column === 2 &&
        cell.row === 0,
    );
    const row1 = halfCells.find(
      (cell) =>
        cell.crosswalkId === "CROSSWALK:NORTH" &&
        cell.column === 2 &&
        cell.row === 1,
    );
    expect(row0).toBeDefined();
    expect(row1).toBeDefined();
    if (row0 === undefined || row1 === undefined) {
      return;
    }
    const pedestrian = paintVisualOccupancy({
      scene,
      index,
      view: viewWith(index, new Set([row0.key])),
      lattice,
      crosswalkCells: halfCells,
      vehicles: [],
      pedestrians: [pedestrianAt(row0)],
    });
    expect(kindOf(pedestrian, row0.key)).toBe("occupied");
    expect(kindOf(pedestrian, row1.key)).toBe("idle");
    expect(pedestrian.markers).toHaveLength(1);

    const slotKey = (index.byResource.get(row0.conflictResourceId) ?? []).find(
      (key) => index.byKey.get(key)?.crosswalkId === undefined,
    );
    expect(slotKey).toBeDefined();
    if (slotKey === undefined) {
      return;
    }
    const vehicle = paintVisualOccupancy({
      scene,
      index,
      view: viewWith(index, new Set([slotKey])),
      lattice,
      crosswalkCells: halfCells,
      vehicles: [],
      pedestrians: [],
    });
    expect(kindOf(vehicle, row0.key)).toBe("occupied");
    expect(kindOf(vehicle, row1.key)).toBe("occupied");
  });

  it("uses the rendered pedestrian position instead of stale cell metadata", () => {
    const scene = createReplayScene(createRoadNetwork());
    const index = buildTrafficLogicGridIndex(scene);
    const lattice = buildVisualLattice(scene);
    const halfCells = crosswalkHalfCells(scene);
    const stale = halfCells.find(
      (cell) =>
        cell.crosswalkId === "CROSSWALK:NORTH" &&
        cell.column === 2 &&
        cell.row === 0,
    );
    const rendered = halfCells.find(
      (cell) =>
        cell.crosswalkId === "CROSSWALK:NORTH" &&
        cell.column === 3 &&
        cell.row === 0,
    );
    expect(stale).toBeDefined();
    expect(rendered).toBeDefined();
    if (stale === undefined || rendered === undefined) {
      return;
    }
    const pedestrian: ReplayPedestrianPose = {
      ...pedestrianAt(stale),
      x: rendered.center.x,
      z: rendered.center.z,
      worldSpace: true,
    };
    const frame = paintVisualOccupancy({
      scene,
      index,
      view: viewWith(index, new Set()),
      lattice,
      crosswalkCells: halfCells,
      vehicles: [],
      pedestrians: [pedestrian],
    });

    expect(kindOf(frame, stale.key)).toBe("idle");
    expect(kindOf(frame, rendered.key)).toBe("occupied");
    expect(frame.markers).toEqual([rendered.center]);
  });

  it("shows waiting pedestrians at their projected curb positions", () => {
    const scene = createReplayScene(createRoadNetwork());
    const index = buildTrafficLogicGridIndex(scene);
    const lattice = buildVisualLattice(scene);
    const halfCells = crosswalkHalfCells(scene);
    const waiting: ReplayPedestrianPose = {
      id: "waiting-pedestrian",
      crosswalkId: "CROSSWALK:EAST",
      direction: "A_TO_B",
      state: "WAITING",
      waitingTicks: 4,
      patienceLimit: 10,
      x: 5.105704697986577,
      z: -5,
      heading: 0,
    };
    const frame = paintVisualOccupancy({
      scene,
      index,
      view: viewWith(index, new Set()),
      lattice,
      crosswalkCells: halfCells,
      vehicles: [],
      pedestrians: [waiting],
    });
    expect(frame.markers).toEqual([
      mapCrosswalkPoint(waiting.x, waiting.z, "EAST"),
    ]);
  });
});

function viewWith(
  index: ReturnType<typeof buildTrafficLogicGridIndex>,
  occupied: ReadonlySet<string>,
) {
  return {
    precision: "route-estimate" as const,
    cells: index.cells.map((cell) => ({
      ...cell,
      kind: occupied.has(cell.key)
        ? ("occupied" as const)
        : ("idle" as const),
    })),
  };
}

function kindOf(
  frame: ReturnType<typeof paintVisualOccupancy>,
  key: string,
) {
  return frame.crosswalk.find((cell) => cell.key === key)?.kind;
}

function pedestrianAt(
  cell: NonNullable<ReturnType<typeof crosswalkHalfCells>[number]>,
): ReplayPedestrianPose {
  return {
    id: "pedestrian",
    crosswalkId: cell.crosswalkId,
    direction: "A_TO_B",
    state: "CROSSING_RESERVED",
    waitingTicks: 0,
    patienceLimit: 10,
    row: cell.row,
    column: cell.column,
    x: 0,
    z: 0,
    heading: 0,
  };
}

function midpoint(
  left: { readonly x: number; readonly z: number },
  right: { readonly x: number; readonly z: number },
) {
  return { x: (left.x + right.x) / 2, z: (left.z + right.z) / 2 };
}
