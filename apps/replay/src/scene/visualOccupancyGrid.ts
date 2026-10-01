import { LANE_CENTER_OFFSETS, ROAD_HALF_WIDTH } from "./mainRoadMarkings.js";
import {
  mapCrosswalkPoint,
  mapSimulationPoint,
  type RoadPoint,
} from "./roadFrame.js";
import type {
  TrafficLogicCellKind,
  TrafficLogicGridIndex,
  TrafficLogicGridView,
} from "./trafficLogicGrid.js";
import type {
  ReplayCrosswalkCellGeometry,
  ReplayCrosswalkGeometry,
  ReplayPedestrianWaitingCellGeometry,
  ReplayPedestrianPose,
  ReplayScene,
  ReplayVehiclePose,
} from "../../../../src/replay/types.js";

/** Inner-lane pitch. Cell edges pass through the intersection origin. */
export const VISUAL_CELL_SIZE = (LANE_CENTER_OFFSETS[3] ?? 0.71) * 2;

export interface VisualQuad {
  readonly key: string;
  readonly corners: readonly [RoadPoint, RoadPoint, RoadPoint, RoadPoint];
  readonly center: RoadPoint;
}

export interface VisualLattice {
  readonly cells: readonly VisualQuad[];
  readonly byKey: ReadonlyMap<string, VisualQuad>;
}

export interface CrosswalkHalfCell extends VisualQuad {
  readonly crosswalkId: string;
  readonly column: number;
  readonly row: 0 | 1;
  readonly conflictResourceId: string;
}

export interface PaintedQuad extends VisualQuad {
  readonly kind: TrafficLogicCellKind;
}

export interface VisualOccupancyFrame {
  readonly precision: TrafficLogicGridView["precision"];
  readonly road: readonly PaintedQuad[];
  readonly crosswalk: readonly PaintedQuad[];
  readonly markers: readonly RoadPoint[];
}

export function latticeIndex(value: number): number {
  return Math.floor(value / VISUAL_CELL_SIZE);
}

export function latticeCellAt(x: number, z: number): string {
  return `${latticeIndex(x)}:${latticeIndex(z)}`;
}

export function buildVisualLattice(scene: ReplayScene): VisualLattice {
  let maxAbs = ROAD_HALF_WIDTH;
  const lanes = [
    ...scene.inboundLanes,
    ...scene.trajectories,
    ...scene.outboundLanes,
  ];
  for (const lane of lanes) {
    for (const slot of lane.slots) {
      const world = mapSimulationPoint(slot.x, slot.z, slot.heading);
      maxAbs = Math.max(maxAbs, Math.abs(world.x), Math.abs(world.z));
    }
  }
  const minIndex = latticeIndex(-maxAbs);
  const maxIndex = latticeIndex(maxAbs);
  const pedestrianCornerKeys = new Set(
    (scene.pedestrianCorners ?? []).flatMap((corner) =>
      corner.cells.map(
        (cell) => `${cell.latticeX ?? latticeIndex(cell.x)}:${cell.latticeZ ?? latticeIndex(cell.z)}`,
      ),
    ),
  );
  const cells: VisualQuad[] = [];
  for (let ix = minIndex; ix <= maxIndex; ix += 1) {
    for (let iz = minIndex; iz <= maxIndex; iz += 1) {
      const centerX = (ix + 0.5) * VISUAL_CELL_SIZE;
      const centerZ = (iz + 0.5) * VISUAL_CELL_SIZE;
      const onNorthSouth = Math.abs(centerX) <= ROAD_HALF_WIDTH + 1e-6;
      const onEastWest = Math.abs(centerZ) <= ROAD_HALF_WIDTH + 1e-6;
      const key = `${ix}:${iz}`;
      if (!onNorthSouth && !onEastWest && !pedestrianCornerKeys.has(key)) {
        continue;
      }
      if (Math.abs(centerX) > maxAbs + VISUAL_CELL_SIZE) {
        continue;
      }
      if (Math.abs(centerZ) > maxAbs + VISUAL_CELL_SIZE) {
        continue;
      }
      const x0 = ix * VISUAL_CELL_SIZE;
      const z0 = iz * VISUAL_CELL_SIZE;
      const x1 = x0 + VISUAL_CELL_SIZE;
      const z1 = z0 + VISUAL_CELL_SIZE;
      cells.push({
        key,
        center: { x: centerX, z: centerZ },
        corners: [
          { x: x0, z: z0 },
          { x: x1, z: z0 },
          { x: x1, z: z1 },
          { x: x0, z: z1 },
        ],
      });
    }
  }
  return {
    cells,
    byKey: new Map(cells.map((cell) => [cell.key, cell])),
  };
}

export function crosswalkHalfCells(
  scene: ReplayScene,
): readonly CrosswalkHalfCell[] {
  const cells: CrosswalkHalfCell[] = [];
  const waitingCellIds = new Set<string>();
  for (const crosswalk of scene.crosswalks) {
    const source = crosswalk.cells ?? [];
    if (source.length === 0) {
      continue;
    }
    for (const cell of source) {
      const quad = halfCellQuad(crosswalk, cell, source);
      if (quad !== undefined) {
        cells.push(quad);
      }
    }
    for (const area of crosswalk.waitingAreas ?? []) {
      if (
        area.entry !== undefined &&
        !waitingCellIds.has(area.entry.id)
      ) {
        cells.push(
          worldCellQuad(
            area.entry.id,
            crosswalk.id,
            area.entry.x,
            area.entry.z,
          ),
        );
        waitingCellIds.add(area.entry.id);
      }
      for (const cell of area.cells) {
        if (waitingCellIds.has(cell.id)) {
          continue;
        }
        const quad = waitingCellQuad(crosswalk, cell, area.cells);
        if (quad !== undefined) {
          cells.push(quad);
          waitingCellIds.add(cell.id);
        }
      }
    }
  }
  for (const path of scene.pedestrianApproachPaths ?? []) {
    for (const cell of path.cells) {
      if (waitingCellIds.has(cell.id)) {
        continue;
      }
      cells.push(
        worldCellQuad(cell.id, path.crosswalkId, cell.x, cell.z),
      );
      waitingCellIds.add(cell.id);
    }
  }
  return cells;
}

function worldCellQuad(
  key: string,
  crosswalkId: string,
  x: number,
  z: number,
): CrosswalkHalfCell {
  const half = VISUAL_CELL_SIZE / 2;
  return {
    key,
    crosswalkId,
    column: latticeIndex(x),
    row: 0,
    conflictResourceId: key,
    center: { x, z },
    corners: [
      { x: x - half, z: z - half },
      { x: x + half, z: z - half },
      { x: x + half, z: z + half },
      { x: x - half, z: z + half },
    ],
  };
}

export function paintVisualOccupancy(input: {
  readonly scene: ReplayScene;
  readonly index: TrafficLogicGridIndex;
  readonly view: TrafficLogicGridView;
  readonly lattice: VisualLattice;
  readonly crosswalkCells: readonly CrosswalkHalfCell[];
  readonly vehicles: readonly ReplayVehiclePose[];
  readonly pedestrians: readonly ReplayPedestrianPose[];
}): VisualOccupancyFrame {
  const logicKind = new Map(
    input.view.cells.map((cell) => [cell.key, cell.kind]),
  );
  const roadKind = new Map<string, TrafficLogicCellKind>();
  for (const cell of input.view.cells) {
    if (cell.crosswalkId !== undefined) {
      continue;
    }
    const world = mapSimulationPoint(cell.x, cell.z, cell.heading);
    const key = latticeCellAt(world.x, world.z);
    if (!input.lattice.byKey.has(key)) {
      continue;
    }
    roadKind.set(key, combineKind(roadKind.get(key) ?? "idle", cell.kind));
  }
  for (const vehicle of input.vehicles) {
    const points = [vehicle, ...vehicle.segments];
    for (const point of points) {
      const world = mapSimulationPoint(point.x, point.z, point.heading);
      const key = latticeCellAt(world.x, world.z);
      if (!input.lattice.byKey.has(key)) {
        continue;
      }
      roadKind.set(key, combineKind(roadKind.get(key) ?? "idle", "occupied"));
    }
  }

  const pedestrianPoints = input.pedestrians.flatMap((pedestrian) => {
    const point = pedestrianWorldPoint(input.scene, pedestrian);
    return point === undefined ? [] : [{ pedestrian, point }];
  });
  const occupiedPedestrianCells = new Set<string>();
  for (const { pedestrian, point } of pedestrianPoints) {
    if (pedestrian.worldSpace !== true) {
      continue;
    }
    const nearest = input.crosswalkCells
      .filter((cell) => cell.crosswalkId === pedestrian.crosswalkId)
      .map((cell) => ({
        cell,
        distance: Math.hypot(cell.center.x - point.x, cell.center.z - point.z),
      }))
      .sort((left, right) => left.distance - right.distance)[0];
    if (nearest !== undefined) {
      occupiedPedestrianCells.add(nearest.cell.key);
    }
  }
  const crosswalk = input.crosswalkCells.map((cell) => ({
    ...cell,
    kind: combineKind(
      combineKind(
        logicKind.get(cell.key) ?? "idle",
        vehicleColumnKind(input.index, logicKind, cell.conflictResourceId),
      ),
      occupiedPedestrianCells.has(cell.key) ? "occupied" : "idle",
    ),
  }));
  const markers = pedestrianPoints.map(({ point }) => point);
  return {
    precision: input.view.precision,
    road: input.lattice.cells.map((cell) => ({
      ...cell,
      kind: roadKind.get(cell.key) ?? "idle",
    })),
    crosswalk,
    markers,
  };
}

function pedestrianWorldPoint(
  scene: ReplayScene,
  pedestrian: ReplayPedestrianPose,
): RoadPoint | undefined {
  if (pedestrian.worldSpace === true) {
    return { x: pedestrian.x, z: pedestrian.z };
  }
  const crosswalk = scene.crosswalks.find(
    (item) => item.id === pedestrian.crosswalkId,
  );
  return crosswalk === undefined
    ? undefined
    : mapCrosswalkPoint(
        pedestrian.x,
        pedestrian.z,
        crosswalk.approach,
      );
}

export function combineKind(
  left: TrafficLogicCellKind,
  right: TrafficLogicCellKind,
): TrafficLogicCellKind {
  const predicted =
    left === "predicted" ||
    left === "overlap" ||
    right === "predicted" ||
    right === "overlap";
  const actual =
    left === "actual" ||
    left === "overlap" ||
    right === "actual" ||
    right === "overlap";
  if (left === "occupied" || right === "occupied") {
    return "occupied";
  }
  if (predicted && actual) {
    return "overlap";
  }
  if (predicted) {
    return "predicted";
  }
  if (actual) {
    return "actual";
  }
  return "idle";
}

function vehicleColumnKind(
  index: TrafficLogicGridIndex,
  logicKind: ReadonlyMap<string, TrafficLogicCellKind>,
  conflictResourceId: string,
): TrafficLogicCellKind {
  let kind: TrafficLogicCellKind = "idle";
  for (const key of index.byResource.get(conflictResourceId) ?? []) {
    const cell = index.byKey.get(key);
    if (cell?.crosswalkId !== undefined) {
      continue;
    }
    kind = combineKind(kind, logicKind.get(key) ?? "idle");
  }
  return kind;
}

function halfCellQuad(
  crosswalk: ReplayCrosswalkGeometry,
  cell: ReplayCrosswalkCellGeometry,
  cells: readonly ReplayCrosswalkCellGeometry[],
): CrosswalkHalfCell | undefined {
  const alongSource = cells.find(
    (item) =>
      item.row === cell.row &&
      item.column === cell.column + (cell.column === 0 ? 1 : -1),
  );
  const acrossSource = cells.find(
    (item) => item.column === cell.column && item.row !== cell.row,
  );
  if (alongSource === undefined || acrossSource === undefined) {
    return undefined;
  }
  const center = mapCrosswalkPoint(cell.x, cell.z, crosswalk.approach);
  const alongNeighbor = mapCrosswalkPoint(
    alongSource.x,
    alongSource.z,
    crosswalk.approach,
  );
  const acrossNeighbor = mapCrosswalkPoint(
    acrossSource.x,
    acrossSource.z,
    crosswalk.approach,
  );
  const alongSign = alongSource.column > cell.column ? 1 : -1;
  const halfAlong = {
    x: ((alongNeighbor.x - center.x) * alongSign) / 2,
    z: ((alongNeighbor.z - center.z) * alongSign) / 2,
  };
  const halfAcross = {
    x: (acrossNeighbor.x - center.x) / 2,
    z: (acrossNeighbor.z - center.z) / 2,
  };
  return {
    key: cell.id,
    crosswalkId: crosswalk.id,
    column: cell.column,
    row: cell.row,
    conflictResourceId: cell.conflictResourceId,
    center,
    corners: [
      shift(center, halfAlong, halfAcross, 1, 1),
      shift(center, halfAlong, halfAcross, 1, -1),
      shift(center, halfAlong, halfAcross, -1, -1),
      shift(center, halfAlong, halfAcross, -1, 1),
    ],
  };
}

function waitingCellQuad(
  crosswalk: ReplayCrosswalkGeometry,
  cell: ReplayPedestrianWaitingCellGeometry,
  cells: readonly ReplayPedestrianWaitingCellGeometry[],
): CrosswalkHalfCell | undefined {
  void cells;
  const half = VISUAL_CELL_SIZE / 2;
  const center = { x: cell.x, z: cell.z };
  return {
    key: cell.id,
    crosswalkId: crosswalk.id,
    column: cell.latticeX,
    row: 0,
    conflictResourceId: cell.id,
    center,
    corners: [
      { x: center.x - half, z: center.z - half },
      { x: center.x + half, z: center.z - half },
      { x: center.x + half, z: center.z + half },
      { x: center.x - half, z: center.z + half },
    ],
  };
}

function shift(
  center: RoadPoint,
  along: RoadPoint,
  across: RoadPoint,
  alongSign: -1 | 1,
  acrossSign: -1 | 1,
): RoadPoint {
  return {
    x: center.x + along.x * alongSign + across.x * acrossSign,
    z: center.z + along.z * alongSign + across.z * acrossSign,
  };
}
