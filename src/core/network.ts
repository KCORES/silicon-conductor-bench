import type {
  CrosswalkCell,
  CrosswalkZone,
  Direction,
  Lane,
  Maneuver,
  PedestrianCorner,
  PedestrianCornerCell,
  PedestrianApproachPath,
  PedestrianDirection,
  PedestrianWaitingArea,
  Point,
  RoadNetwork,
  Trajectory,
  TrajectorySlot,
} from "./types.js";

interface CrosswalkDefinition {
  readonly approach: Direction;
  readonly start: Point;
  readonly end: Point;
}

interface MutableCrosswalkCell extends CrosswalkCell {
  readonly vehicleSlotIds: string[];
}

interface MutableCrosswalkZone extends Omit<CrosswalkZone, "cells"> {
  readonly cells: MutableCrosswalkCell[];
}

interface RouteDefinition {
  readonly id: string;
  readonly origin: Direction;
  readonly destination: Direction;
  readonly maneuver: Maneuver;
  readonly inboundLaneId: string;
  readonly outboundLaneIndex: 0 | 1 | 2 | 3;
  readonly entry: Point;
  readonly exit: Point;
  readonly guidanceForRouteId?: string;
}

export const INTERSECTION_EDGE = 7;
export const CROSSWALK_STOPLINE_SETBACK = 6 - 6 * (6.65 / 7.45);
export const CROSSWALK_SIM_DISTANCE =
  INTERSECTION_EDGE - CROSSWALK_STOPLINE_SETBACK;
export const CROSSWALK_COLUMNS = 8;
export const CROSSWALK_ROWS = 2;
export const PEDESTRIAN_VISUAL_CELL_SIZE = 1.42;

type PedestrianCornerId = "CORNER:NE" | "CORNER:NW" | "CORNER:SW" | "CORNER:SE";

interface WaitingAreaBinding {
  readonly cornerId: PedestrianCornerId;
  readonly entryIndex: 0 | 1;
}

const WAITING_AREA_BINDINGS: Readonly<Record<string, WaitingAreaBinding>> = {
  "CROSSWALK:SOUTH:B_TO_A": { cornerId: "CORNER:NE", entryIndex: 0 },
  "CROSSWALK:EAST:B_TO_A": { cornerId: "CORNER:NE", entryIndex: 1 },
  "CROSSWALK:WEST:B_TO_A": { cornerId: "CORNER:NW", entryIndex: 0 },
  "CROSSWALK:SOUTH:A_TO_B": { cornerId: "CORNER:NW", entryIndex: 1 },
  "CROSSWALK:NORTH:A_TO_B": { cornerId: "CORNER:SW", entryIndex: 0 },
  "CROSSWALK:WEST:A_TO_B": { cornerId: "CORNER:SW", entryIndex: 1 },
  "CROSSWALK:EAST:A_TO_B": { cornerId: "CORNER:SE", entryIndex: 0 },
  "CROSSWALK:NORTH:B_TO_A": { cornerId: "CORNER:SE", entryIndex: 1 },
};

const BASE_ROUTE_DEFINITIONS: readonly RouteDefinition[] = [
  route("N_L1_LEFT", "NORTH", "EAST", "LEFT", 3, [-1, -INTERSECTION_EDGE], [INTERSECTION_EDGE, 0]),
  route("N_S1_STRAIGHT", "NORTH", "SOUTH", "STRAIGHT", 1, [-3, -INTERSECTION_EDGE], [-3, INTERSECTION_EDGE]),
  route("N_S2_STRAIGHT", "NORTH", "SOUTH", "STRAIGHT", 2, [-2, -INTERSECTION_EDGE], [-2, INTERSECTION_EDGE]),
  route("N_R1_RIGHT", "NORTH", "WEST", "RIGHT", 0, [-4, -INTERSECTION_EDGE], [-INTERSECTION_EDGE, -4]),
  route("S_L1_LEFT", "SOUTH", "WEST", "LEFT", 3, [0, INTERSECTION_EDGE], [-INTERSECTION_EDGE, -1]),
  route("S_S1_STRAIGHT", "SOUTH", "NORTH", "STRAIGHT", 1, [2, INTERSECTION_EDGE], [2, -INTERSECTION_EDGE]),
  route("S_S2_STRAIGHT", "SOUTH", "NORTH", "STRAIGHT", 2, [1, INTERSECTION_EDGE], [1, -INTERSECTION_EDGE]),
  route("S_R1_RIGHT", "SOUTH", "EAST", "RIGHT", 0, [3, INTERSECTION_EDGE], [INTERSECTION_EDGE, 3]),
  route("E_L1_LEFT", "EAST", "SOUTH", "LEFT", 3, [INTERSECTION_EDGE, -1], [-1, INTERSECTION_EDGE]),
  route("E_S1_STRAIGHT", "EAST", "WEST", "STRAIGHT", 1, [INTERSECTION_EDGE, -3], [-INTERSECTION_EDGE, -3]),
  route("E_S2_STRAIGHT", "EAST", "WEST", "STRAIGHT", 2, [INTERSECTION_EDGE, -2], [-INTERSECTION_EDGE, -2]),
  route("E_R1_RIGHT", "EAST", "NORTH", "RIGHT", 0, [INTERSECTION_EDGE, -4], [3, -INTERSECTION_EDGE]),
  route("W_L1_LEFT", "WEST", "NORTH", "LEFT", 3, [-INTERSECTION_EDGE, 0], [0, -INTERSECTION_EDGE]),
  route("W_S1_STRAIGHT", "WEST", "EAST", "STRAIGHT", 1, [-INTERSECTION_EDGE, 2], [INTERSECTION_EDGE, 2]),
  route("W_S2_STRAIGHT", "WEST", "EAST", "STRAIGHT", 2, [-INTERSECTION_EDGE, 1], [INTERSECTION_EDGE, 1]),
  route("W_R1_RIGHT", "WEST", "SOUTH", "RIGHT", 0, [-INTERSECTION_EDGE, 3], [-4, INTERSECTION_EDGE]),
];

const GUIDANCE_ROUTE_DEFINITIONS: readonly RouteDefinition[] = [
  guidedRoute("N_S2_GUIDED_LEFT", "NORTH", "EAST", "LEFT", "IN_N_S2_STRAIGHT", 3, [-2, -INTERSECTION_EDGE], [INTERSECTION_EDGE, 0], "N_L1_LEFT"),
  guidedRoute("S_S2_GUIDED_LEFT", "SOUTH", "WEST", "LEFT", "IN_S_S2_STRAIGHT", 3, [1, INTERSECTION_EDGE], [-INTERSECTION_EDGE, -1], "S_L1_LEFT"),
  guidedRoute("E_S2_GUIDED_LEFT", "EAST", "SOUTH", "LEFT", "IN_E_S2_STRAIGHT", 3, [INTERSECTION_EDGE, -2], [-1, INTERSECTION_EDGE], "E_L1_LEFT"),
  guidedRoute("W_S2_GUIDED_LEFT", "WEST", "NORTH", "LEFT", "IN_W_S2_STRAIGHT", 3, [-INTERSECTION_EDGE, 1], [0, -INTERSECTION_EDGE], "W_L1_LEFT"),
  guidedRoute("N_R1_GUIDED_STRAIGHT", "NORTH", "SOUTH", "STRAIGHT", "IN_N_R1_RIGHT", 1, [-4, -INTERSECTION_EDGE], [-3, INTERSECTION_EDGE], "N_S1_STRAIGHT"),
  guidedRoute("S_R1_GUIDED_STRAIGHT", "SOUTH", "NORTH", "STRAIGHT", "IN_S_R1_RIGHT", 1, [3, INTERSECTION_EDGE], [2, -INTERSECTION_EDGE], "S_S1_STRAIGHT"),
  guidedRoute("E_R1_GUIDED_STRAIGHT", "EAST", "WEST", "STRAIGHT", "IN_E_R1_RIGHT", 1, [INTERSECTION_EDGE, -4], [-INTERSECTION_EDGE, -3], "E_S1_STRAIGHT"),
  guidedRoute("W_R1_GUIDED_STRAIGHT", "WEST", "EAST", "STRAIGHT", "IN_W_R1_RIGHT", 1, [-INTERSECTION_EDGE, 3], [INTERSECTION_EDGE, 2], "W_S1_STRAIGHT"),
  guidedRoute("N_S1_GUIDED_RIGHT", "NORTH", "WEST", "RIGHT", "IN_N_S1_STRAIGHT", 0, [-3, -INTERSECTION_EDGE], [-INTERSECTION_EDGE, -4], "N_R1_RIGHT"),
  guidedRoute("S_S1_GUIDED_RIGHT", "SOUTH", "EAST", "RIGHT", "IN_S_S1_STRAIGHT", 0, [2, INTERSECTION_EDGE], [INTERSECTION_EDGE, 3], "S_R1_RIGHT"),
  guidedRoute("E_S1_GUIDED_RIGHT", "EAST", "NORTH", "RIGHT", "IN_E_S1_STRAIGHT", 0, [INTERSECTION_EDGE, -3], [3, -INTERSECTION_EDGE], "E_R1_RIGHT"),
  guidedRoute("W_S1_GUIDED_RIGHT", "WEST", "SOUTH", "RIGHT", "IN_W_S1_STRAIGHT", 0, [-INTERSECTION_EDGE, 2], [-4, INTERSECTION_EDGE], "W_R1_RIGHT"),
  guidedRoute("N_L1_GUIDED_STRAIGHT", "NORTH", "SOUTH", "STRAIGHT", "IN_N_L1_LEFT", 2, [-1, -INTERSECTION_EDGE], [-2, INTERSECTION_EDGE], "N_S2_STRAIGHT"),
  guidedRoute("S_L1_GUIDED_STRAIGHT", "SOUTH", "NORTH", "STRAIGHT", "IN_S_L1_LEFT", 2, [0, INTERSECTION_EDGE], [1, -INTERSECTION_EDGE], "S_S2_STRAIGHT"),
  guidedRoute("E_L1_GUIDED_STRAIGHT", "EAST", "WEST", "STRAIGHT", "IN_E_L1_LEFT", 2, [INTERSECTION_EDGE, -1], [-INTERSECTION_EDGE, -2], "E_S2_STRAIGHT"),
  guidedRoute("W_L1_GUIDED_STRAIGHT", "WEST", "EAST", "STRAIGHT", "IN_W_L1_LEFT", 2, [-INTERSECTION_EDGE, 0], [INTERSECTION_EDGE, 1], "W_S2_STRAIGHT"),
];

const ROUTE_DEFINITIONS: readonly RouteDefinition[] = [
  ...BASE_ROUTE_DEFINITIONS,
  ...GUIDANCE_ROUTE_DEFINITIONS,
];

const CROSSWALK_DEFINITIONS: readonly CrosswalkDefinition[] = [
  crosswalkDefinition("NORTH", [-4, -CROSSWALK_SIM_DISTANCE], [3, -CROSSWALK_SIM_DISTANCE]),
  crosswalkDefinition("EAST", [CROSSWALK_SIM_DISTANCE, -4], [CROSSWALK_SIM_DISTANCE, 3]),
  crosswalkDefinition("SOUTH", [-4, CROSSWALK_SIM_DISTANCE], [3, CROSSWALK_SIM_DISTANCE]),
  crosswalkDefinition("WEST", [-CROSSWALK_SIM_DISTANCE, -4], [-CROSSWALK_SIM_DISTANCE, 3]),
];

function crosswalkDefinition(
  approach: Direction,
  start: readonly [number, number],
  end: readonly [number, number],
): CrosswalkDefinition {
  return {
    approach,
    start: { x: start[0], y: start[1] },
    end: { x: end[0], y: end[1] },
  };
}

function route(
  id: string,
  origin: Direction,
  destination: Direction,
  maneuver: Maneuver,
  outboundLaneIndex: 0 | 1 | 2 | 3,
  entry: readonly [number, number],
  exit: readonly [number, number],
): RouteDefinition {
  return {
    id,
    origin,
    destination,
    maneuver,
    inboundLaneId: `IN_${id}`,
    outboundLaneIndex,
    entry: { x: entry[0], y: entry[1] },
    exit: { x: exit[0], y: exit[1] },
  };
}

function guidedRoute(
  id: string,
  origin: Direction,
  destination: Direction,
  maneuver: Maneuver,
  inboundLaneId: string,
  outboundLaneIndex: 0 | 1 | 2 | 3,
  entry: readonly [number, number],
  exit: readonly [number, number],
  guidanceForRouteId: string,
): RouteDefinition {
  return {
    id,
    origin,
    destination,
    maneuver,
    inboundLaneId,
    outboundLaneIndex,
    entry: { x: entry[0], y: entry[1] },
    exit: { x: exit[0], y: exit[1] },
    guidanceForRouteId,
  };
}

export function defaultRouteIds(network: RoadNetwork): string[] {
  return [...network.trajectories.values()]
    .filter(
      (trajectory) =>
        trajectory.guidanceForRouteId === undefined &&
        network.inboundLanes.get(trajectory.inboundLaneId)?.routeId ===
          trajectory.id,
    )
    .map((trajectory) => trajectory.id)
    .sort();
}

export interface NetworkOptions {
  readonly inboundLaneLength?: number;
  readonly outboundLaneLength?: number;
  readonly safetyDistanceCells?: number;
}

export function createRoadNetwork(options: NetworkOptions = {}): RoadNetwork {
  const inboundLaneLength = options.inboundLaneLength ?? 24;
  const outboundLaneLength = options.outboundLaneLength ?? 15;
  const safetyDistanceCells = options.safetyDistanceCells ?? 0;

  const inboundLanes = new Map<string, Lane>();
  const outboundLanes = new Map<string, Lane>();
  const pedestrianCorners = buildPedestrianCorners();
  const mutableCrosswalks = CROSSWALK_DEFINITIONS.map((definition) =>
    buildCrosswalk(definition, pedestrianCorners),
  );
  const mutableSlots = new Map<string, Array<{ point: Point; resources: Set<string> }>>();

  for (const direction of ["NORTH", "EAST", "SOUTH", "WEST"] as const) {
    for (let index = 0; index < 4; index += 1) {
      const id = outboundLaneId(direction, index);
      outboundLanes.set(id, {
        id,
        direction,
        kind: "OUTBOUND",
        capacitySlots: outboundLaneLength,
        anchor: outboundAnchor(direction, index),
      });
    }
  }

  for (const definition of ROUTE_DEFINITIONS) {
    if (definition.guidanceForRouteId === undefined) {
      inboundLanes.set(definition.inboundLaneId, {
        id: definition.inboundLaneId,
        direction: definition.origin,
        kind: "INBOUND",
        capacitySlots: inboundLaneLength,
        anchor: definition.entry,
        routeId: definition.id,
      });
    }

    const points = sampleTrajectory(definition);
    mutableSlots.set(
      definition.id,
      points.map((point) => ({
        point,
        resources: new Set([`SPACE:${point.x}:${point.y}`]),
      })),
    );
  }

  addPairwiseConflictResources(mutableSlots, safetyDistanceCells);
  addCrosswalkConflictResources(mutableSlots, mutableCrosswalks);

  const trajectories = new Map<string, Trajectory>();
  for (const definition of ROUTE_DEFINITIONS) {
    const sourceSlots = mutableSlots.get(definition.id);
    if (sourceSlots === undefined) {
      throw new Error(`Missing generated slots for ${definition.id}`);
    }

    const slots: TrajectorySlot[] = sourceSlots.map((slot, index) => ({
      slotId: `${definition.id}:${index}`,
      index,
      x: slot.point.x,
      y: slot.point.y,
      conflictResourceIds: [...slot.resources].sort(),
      controlResourceIds:
        index <= 1 ? [`CROSSWALK:${definition.origin}`] : [],
    }));

    trajectories.set(definition.id, {
      id: definition.id,
      origin: definition.origin,
      destination: definition.destination,
      maneuver: definition.maneuver,
      inboundLaneId: definition.inboundLaneId,
      outboundLaneId: outboundLaneId(
        definition.destination,
        definition.outboundLaneIndex,
      ),
      ...(definition.guidanceForRouteId === undefined
        ? {}
        : { guidanceForRouteId: definition.guidanceForRouteId }),
      slots,
    });
  }

  const crosswalks = new Map<string, CrosswalkZone>(
    mutableCrosswalks.map((zone) => [
      zone.id,
      {
        ...zone,
        cells: zone.cells.map((cell) => ({
          ...cell,
          vehicleSlotIds: [...cell.vehicleSlotIds].sort(),
        })),
      },
    ]),
  );
  const pedestrianApproachPaths = buildPedestrianApproachPaths(crosswalks);

  return {
    inboundLanes,
    outboundLanes,
    trajectories,
    crosswalks,
    pedestrianCorners,
    pedestrianApproachPaths,
  };
}

function buildPedestrianApproachPaths(
  crosswalks: ReadonlyMap<string, CrosswalkZone>,
): ReadonlyMap<string, PedestrianApproachPath> {
  const paths = new Map<string, PedestrianApproachPath>();
  const cornerTurns: Readonly<Record<string, number>> = {
    "CORNER:NE": 0,
    "CORNER:NW": 1,
    "CORNER:SW": 2,
    "CORNER:SE": 3,
  };
  for (const crosswalk of crosswalks.values()) {
    for (const area of crosswalk.waitingAreas) {
      const quarterTurns = cornerTurns[area.cornerId];
      if (quarterTurns === undefined) {
        throw new Error(`Missing approach rotation for ${area.cornerId}`);
      }
      const waitingCells = [...area.cells].sort(
        (left, right) =>
          (left.kind === "WAITING_ZONE" ? 0 : 1) -
            (right.kind === "WAITING_ZONE" ? 0 : 1) ||
          left.id.localeCompare(right.id),
      );
      const entrance =
        WAITING_AREA_BINDINGS[`${crosswalk.id}:${area.direction}`]?.entryIndex;
      if (entrance === undefined) {
        throw new Error(`Missing approach entrance for ${area.id}`);
      }
      const localPortal =
        entrance === 0 ? { x: 28, y: 26 } : { x: 26, y: 28 };
      const portal = rotatePoint(localPortal, quarterTurns);
      for (const target of waitingCells) {
        const bend =
          entrance === 0
            ? { x: target.x, y: portal.y }
            : { x: portal.x, y: target.y };
        const id = `APPROACH:${area.id}:${target.id}`;
        const points = resamplePedestrianPolyline(
          [portal, bend, { x: target.x, y: target.y }],
          PEDESTRIAN_VISUAL_CELL_SIZE,
        );
        paths.set(id, {
          id,
          crosswalkId: crosswalk.id,
          direction: area.direction,
          cornerId: area.cornerId,
          targetWaitingCellId: target.id,
          cells: points.map((point, index) => ({
            id: `APPROACH:CELL:${point.x.toFixed(3)}:${point.y.toFixed(3)}`,
            pathId: id,
            index,
            ...point,
          })),
        });
      }
    }
  }
  return paths;
}

function resamplePedestrianPolyline(
  points: readonly Point[],
  spacing: number,
): Point[] {
  const sampled: Point[] = [];
  for (let segment = 0; segment < points.length - 1; segment += 1) {
    const from = points[segment];
    const to = points[segment + 1];
    if (from === undefined || to === undefined) {
      continue;
    }
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(distance / spacing));
    for (let step = segment === 0 ? 0 : 1; step <= steps; step += 1) {
      const ratio = step / steps;
      sampled.push({ x: from.x + dx * ratio, y: from.y + dy * ratio });
    }
  }
  return sampled;
}

function buildCrosswalk(
  definition: CrosswalkDefinition,
  pedestrianCorners: ReadonlyMap<string, PedestrianCorner>,
): MutableCrosswalkZone {
  const id = `CROSSWALK:${definition.approach}`;
  const deltaX = definition.end.x - definition.start.x;
  const deltaY = definition.end.y - definition.start.y;
  const length = Math.hypot(deltaX, deltaY);
  const normalX = -deltaY / length;
  const normalY = deltaX / length;
  const cells: MutableCrosswalkCell[] = [];

  for (let column = 0; column < CROSSWALK_COLUMNS; column += 1) {
    const ratio = column / (CROSSWALK_COLUMNS - 1);
    const centerX = definition.start.x + deltaX * ratio;
    const centerY = definition.start.y + deltaY * ratio;
    for (const row of [0, 1] as const) {
      const rowOffset = row === 0 ? -0.25 : 0.25;
      const conflictResourceId = `${id}:CELL:${column}:${row}`;
      cells.push({
        id: `${id}:${column}:${row}`,
        crosswalkId: id,
        column,
        row,
        x: centerX + normalX * rowOffset,
        y: centerY + normalY * rowOffset,
        conflictResourceId,
        vehicleSlotIds: [],
      });
    }
  }

  return {
    id,
    approach: definition.approach,
    start: definition.start,
    end: definition.end,
    cells,
    waitingAreas: (["A_TO_B", "B_TO_A"] as const).map((direction) =>
      buildWaitingArea(id, definition, direction, pedestrianCorners),
    ),
  };
}

function buildWaitingArea(
  crosswalkId: string,
  definition: CrosswalkDefinition,
  direction: PedestrianDirection,
  pedestrianCorners: ReadonlyMap<string, PedestrianCorner>,
): PedestrianWaitingArea {
  const binding = WAITING_AREA_BINDINGS[`${crosswalkId}:${direction}`];
  if (binding === undefined) {
    throw new Error(`Missing pedestrian corner binding for ${crosswalkId}:${direction}`);
  }
  const corner = pedestrianCorners.get(binding.cornerId);
  const entry = corner?.entrances[binding.entryIndex];
  if (corner === undefined || entry === undefined) {
    throw new Error(`Missing pedestrian corner geometry for ${binding.cornerId}`);
  }
  const id = `WAITING:${definition.approach}:${direction}`;
  return {
    id,
    crosswalkId,
    direction,
    cornerId: corner.id,
    entryCellId: entry.id,
    cells: corner.cells,
  };
}

function buildPedestrianCorners(): ReadonlyMap<string, PedestrianCorner> {
  const definitions = [
    { id: "CORNER:NE", quarterTurns: 0 },
    { id: "CORNER:NW", quarterTurns: 1 },
    { id: "CORNER:SW", quarterTurns: 2 },
    { id: "CORNER:SE", quarterTurns: 3 },
  ] as const;
  return new Map(
    definitions.map(({ id, quarterTurns }) => {
      const cells: PedestrianCornerCell[] = [];
      const localCells = [
        ...[5, 6].flatMap((latticeX) =>
          Array.from({ length: 5 }, (_, index) => [latticeX, 5 + index] as const),
        ),
        ...[5, 6].flatMap((latticeY) =>
          Array.from({ length: 3 }, (_, index) => [7 + index, latticeY] as const),
        ),
      ];
      for (const [latticeX, latticeY] of localCells) {
        const center = rotatePoint(
          latticeCenter(latticeX, latticeY),
          quarterTurns,
        );
        const rotatedLatticeX = latticeIndex(center.x);
        const rotatedLatticeY = latticeIndex(center.y);
        cells.push({
          id: `${id}:CELL:${rotatedLatticeX}:${rotatedLatticeY}`,
          cornerId: id,
          latticeX: rotatedLatticeX,
          latticeY: rotatedLatticeY,
          kind:
            latticeX <= 6 && latticeY <= 6
              ? "WAITING_ZONE"
              : "SIDEWALK_QUEUE",
          x: center.x,
          y: center.y,
        });
      }
      cells.sort(
        (left, right) =>
          (left.kind === "WAITING_ZONE" ? 0 : 1) -
            (right.kind === "WAITING_ZONE" ? 0 : 1) ||
          left.latticeX - right.latticeX ||
          left.latticeY - right.latticeY,
      );
      const entrances = [
        rotatePoint(latticeCenter(4, 5), quarterTurns),
        rotatePoint(latticeCenter(5, 4), quarterTurns),
      ].map((point) => {
        const latticeX = latticeIndex(point.x);
        const latticeY = latticeIndex(point.y);
        return {
          id: `${id}:ENTRY:${latticeX}:${latticeY}`,
          cornerId: id,
          latticeX,
          latticeY,
          x: point.x,
          y: point.y,
        };
      });
      return [id, { id, cells, entrances }] as const;
    }),
  );
}

function latticeCenter(latticeX: number, latticeY: number): Point {
  return {
    x: (latticeX + 0.5) * PEDESTRIAN_VISUAL_CELL_SIZE,
    y: (latticeY + 0.5) * PEDESTRIAN_VISUAL_CELL_SIZE,
  };
}

function latticeIndex(value: number): number {
  return Math.floor(value / PEDESTRIAN_VISUAL_CELL_SIZE);
}

function rotatePoint(point: Point, quarterTurns: number): Point {
  switch (quarterTurns % 4) {
    case 1:
      return { x: -point.y, y: point.x };
    case 2:
      return { x: -point.x, y: -point.y };
    case 3:
      return { x: point.y, y: -point.x };
    default:
      return point;
  }
}

function outboundLaneId(direction: Direction, index: number): string {
  return `OUT_${direction}_${index}`;
}

function outboundAnchor(direction: Direction, index: number): Point {
  const positive = [3, 2, 1, 0] as const;
  const negative = [-4, -3, -2, -1] as const;
  const positiveOffset = positive[index] ?? 0;
  const negativeOffset = negative[index] ?? -1;
  switch (direction) {
    case "NORTH":
      return { x: positiveOffset, y: -INTERSECTION_EDGE };
    case "EAST":
      return { x: INTERSECTION_EDGE, y: positiveOffset };
    case "SOUTH":
      return { x: negativeOffset, y: INTERSECTION_EDGE };
    case "WEST":
      return { x: -INTERSECTION_EDGE, y: negativeOffset };
  }
}

function sampleTrajectory(definition: RouteDefinition): Point[] {
  if (definition.maneuver === "STRAIGHT") {
    return sampleLine(definition.entry, definition.exit);
  }

  const sampled: Point[] = [];
  const seen = new Set<string>();
  const sampleCount = 32;
  const control =
    definition.origin === "NORTH" || definition.origin === "SOUTH"
      ? { x: definition.entry.x, y: definition.exit.y }
      : { x: definition.exit.x, y: definition.entry.y };

  for (let step = 0; step <= sampleCount; step += 1) {
    const t = step / sampleCount;
    const inverse = 1 - t;
    const point = {
      x: Math.round(
        inverse * inverse * definition.entry.x +
          2 * inverse * t * control.x +
          t * t * definition.exit.x,
      ),
      y: Math.round(
        inverse * inverse * definition.entry.y +
          2 * inverse * t * control.y +
          t * t * definition.exit.y,
      ),
    };
    const key = `${point.x}:${point.y}`;
    if (!seen.has(key)) {
      sampled.push(point);
      seen.add(key);
    }
  }

  return sampled;
}

function sampleLine(start: Point, finish: Point): Point[] {
  const distance = Math.max(
    Math.abs(finish.x - start.x),
    Math.abs(finish.y - start.y),
  );
  const points: Point[] = [];

  for (let step = 0; step <= distance; step += 1) {
    const ratio = distance === 0 ? 0 : step / distance;
    points.push({
      x: Math.round(start.x + (finish.x - start.x) * ratio),
      y: Math.round(start.y + (finish.y - start.y) * ratio),
    });
  }

  return points;
}

function addPairwiseConflictResources(
  routes: Map<string, Array<{ point: Point; resources: Set<string> }>>,
  safetyDistanceCells: number,
): void {
  const allSlots = [...routes.entries()].flatMap(([routeId, slots]) =>
    slots.map((slot, index) => ({ routeId, index, ...slot })),
  );

  for (let leftIndex = 0; leftIndex < allSlots.length; leftIndex += 1) {
    const left = allSlots[leftIndex];
    if (left === undefined) {
      continue;
    }

    for (
      let rightIndex = leftIndex + 1;
      rightIndex < allSlots.length;
      rightIndex += 1
    ) {
      const right = allSlots[rightIndex];
      if (right === undefined || left.routeId === right.routeId) {
        continue;
      }

      const distance = Math.max(
        Math.abs(left.point.x - right.point.x),
        Math.abs(left.point.y - right.point.y),
      );
      const sweptIntersection =
        left.index > 0 &&
        right.index > 0 &&
        segmentsIntersect(
          allSlots.find(
            (slot) =>
              slot.routeId === left.routeId && slot.index === left.index - 1,
          )?.point ?? left.point,
          left.point,
          allSlots.find(
            (slot) =>
              slot.routeId === right.routeId && slot.index === right.index - 1,
          )?.point ?? right.point,
          right.point,
        );
      if (distance > safetyDistanceCells && !sweptIntersection) {
        continue;
      }

      const resourceId = `PAIR:${left.routeId}:${left.index}|${right.routeId}:${right.index}`;
      left.resources.add(resourceId);
      right.resources.add(resourceId);
    }
  }
}

function addCrosswalkConflictResources(
  routes: Map<string, Array<{ point: Point; resources: Set<string> }>>,
  crosswalks: readonly MutableCrosswalkZone[],
): void {
  for (const [routeId, slots] of routes) {
    for (let slotIndex = 1; slotIndex < slots.length; slotIndex += 1) {
      const previous = slots[slotIndex - 1];
      const current = slots[slotIndex];
      if (previous === undefined || current === undefined) {
        continue;
      }

      for (const crosswalk of crosswalks) {
        const intersection = segmentIntersectionPoint(
          previous.point,
          current.point,
          crosswalk.start,
          crosswalk.end,
        );
        if (intersection === undefined) {
          continue;
        }

        const deltaX = crosswalk.end.x - crosswalk.start.x;
        const deltaY = crosswalk.end.y - crosswalk.start.y;
        const lengthSquared = deltaX * deltaX + deltaY * deltaY;
        const ratio =
          ((intersection.x - crosswalk.start.x) * deltaX +
            (intersection.y - crosswalk.start.y) * deltaY) /
          lengthSquared;
        const column = Math.round(ratio * (CROSSWALK_COLUMNS - 1));

        for (const cell of crosswalk.cells) {
          if (cell.column !== column) {
            continue;
          }
          previous.resources.add(cell.conflictResourceId);
          current.resources.add(cell.conflictResourceId);
          for (const ownerSlotId of [
            `${routeId}:${slotIndex - 1}`,
            `${routeId}:${slotIndex}`,
          ]) {
            if (!cell.vehicleSlotIds.includes(ownerSlotId)) {
              cell.vehicleSlotIds.push(ownerSlotId);
            }
          }
        }
      }
    }
  }
}

function segmentIntersectionPoint(
  a: Point,
  b: Point,
  c: Point,
  d: Point,
): Point | undefined {
  const denominator =
    (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
  if (Math.abs(denominator) < Number.EPSILON) {
    return undefined;
  }

  const determinantAB = a.x * b.y - a.y * b.x;
  const determinantCD = c.x * d.y - c.y * d.x;
  const point = {
    x:
      (determinantAB * (c.x - d.x) -
        (a.x - b.x) * determinantCD) /
      denominator,
    y:
      (determinantAB * (c.y - d.y) -
        (a.y - b.y) * determinantCD) /
      denominator,
  };
  const tolerance = 1e-9;
  if (
    point.x < Math.min(a.x, b.x) - tolerance ||
    point.x > Math.max(a.x, b.x) + tolerance ||
    point.y < Math.min(a.y, b.y) - tolerance ||
    point.y > Math.max(a.y, b.y) + tolerance ||
    point.x < Math.min(c.x, d.x) - tolerance ||
    point.x > Math.max(c.x, d.x) + tolerance ||
    point.y < Math.min(c.y, d.y) - tolerance ||
    point.y > Math.max(c.y, d.y) + tolerance
  ) {
    return undefined;
  }
  return point;
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);

  if (abC === 0 && onSegment(a, b, c)) return true;
  if (abD === 0 && onSegment(a, b, d)) return true;
  if (cdA === 0 && onSegment(c, d, a)) return true;
  if (cdB === 0 && onSegment(c, d, b)) return true;
  return Math.sign(abC) !== Math.sign(abD) && Math.sign(cdA) !== Math.sign(cdB);
}

function orientation(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a: Point, b: Point, point: Point): boolean {
  return (
    point.x >= Math.min(a.x, b.x) &&
    point.x <= Math.max(a.x, b.x) &&
    point.y >= Math.min(a.y, b.y) &&
    point.y <= Math.max(a.y, b.y)
  );
}
