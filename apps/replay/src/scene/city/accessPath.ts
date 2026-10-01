import type { CardinalDirection } from "./cityLayout.js";

export interface GridPoint {
  readonly x: number;
  readonly z: number;
}

export interface AccessEntrance {
  readonly point: GridPoint;
  readonly facing: CardinalDirection;
}

export interface AccessRouteRequest {
  readonly width: number;
  readonly depth: number;
  readonly entrances: readonly AccessEntrance[];
  readonly blocked: ReadonlySet<string>;
  readonly roads: ReadonlySet<string>;
  readonly network: ReadonlySet<string>;
}

export interface AccessRoute {
  readonly facing: CardinalDirection;
  readonly points: readonly GridPoint[];
}

const DIRECTIONS = ["north", "east", "south", "west"] as const;
const DELTAS: Readonly<
  Record<CardinalDirection, readonly [number, number]>
> = {
  north: [0, 1],
  east: [1, 0],
  south: [0, -1],
  west: [-1, 0],
};

interface SearchState {
  readonly point: GridPoint;
  readonly direction: CardinalDirection | undefined;
  readonly entranceIndex: number;
  readonly cost: number;
  readonly key: string;
}

export function gridKey(point: GridPoint): string {
  return `${point.x}:${point.z}`;
}

export function findAccessRoute(
  request: AccessRouteRequest,
): AccessRoute | undefined {
  const open: SearchState[] = [];
  const bestCosts = new Map<string, number>();
  const parents = new Map<string, string>();
  const states = new Map<string, SearchState>();

  for (const [entranceIndex, entrance] of request.entrances.entries()) {
    const pointKey = gridKey(entrance.point);
    if (
      request.blocked.has(pointKey) &&
      !request.network.has(pointKey)
    ) {
      continue;
    }
    const state = createState(
      entrance.point,
      undefined,
      entranceIndex,
      0,
    );
    open.push(state);
    bestCosts.set(state.key, 0);
    states.set(state.key, state);
  }

  while (open.length > 0) {
    open.sort(compareStates);
    const current = open.shift();
    if (current === undefined) {
      break;
    }
    if (current.cost > (bestCosts.get(current.key) ?? Number.POSITIVE_INFINITY)) {
      continue;
    }
    if (isAccessRoot(current.point, request)) {
      const entrance = request.entrances[current.entranceIndex];
      if (entrance === undefined) {
        return undefined;
      }
      return {
        facing: entrance.facing,
        points: reconstructPath(current.key, parents, states),
      };
    }

    for (const direction of DIRECTIONS) {
      const [deltaX, deltaZ] = DELTAS[direction];
      const nextPoint = {
        x: current.point.x + deltaX,
        z: current.point.z + deltaZ,
      };
      if (!isInside(nextPoint, request.width, request.depth)) {
        continue;
      }
      const nextPointKey = gridKey(nextPoint);
      if (
        request.blocked.has(nextPointKey) &&
        !request.network.has(nextPointKey)
      ) {
        continue;
      }
      const reuseCost = request.network.has(nextPointKey) ? 0.15 : 1;
      const turnCost =
        current.direction === undefined || current.direction === direction
          ? 0
          : 0.25;
      const nextCost = current.cost + reuseCost + turnCost;
      const nextState = createState(
        nextPoint,
        direction,
        current.entranceIndex,
        nextCost,
      );
      if (nextCost >= (bestCosts.get(nextState.key) ?? Number.POSITIVE_INFINITY)) {
        continue;
      }
      bestCosts.set(nextState.key, nextCost);
      parents.set(nextState.key, current.key);
      states.set(nextState.key, nextState);
      open.push(nextState);
    }
  }

  return undefined;
}

function createState(
  point: GridPoint,
  direction: CardinalDirection | undefined,
  entranceIndex: number,
  cost: number,
): SearchState {
  return {
    point,
    direction,
    entranceIndex,
    cost,
    key: `${gridKey(point)}:${direction ?? "start"}:${entranceIndex}`,
  };
}

function compareStates(left: SearchState, right: SearchState): number {
  return (
    left.cost - right.cost ||
    left.point.z - right.point.z ||
    left.point.x - right.point.x ||
    left.entranceIndex - right.entranceIndex ||
    DIRECTIONS.indexOf(left.direction ?? "north") -
      DIRECTIONS.indexOf(right.direction ?? "north")
  );
}

function isAccessRoot(
  point: GridPoint,
  request: AccessRouteRequest,
): boolean {
  if (request.network.has(gridKey(point)) || point.x === 0 || point.z === 0) {
    return true;
  }
  return DIRECTIONS.some((direction) => {
    const [deltaX, deltaZ] = DELTAS[direction];
    return request.roads.has(
      gridKey({ x: point.x + deltaX, z: point.z + deltaZ }),
    );
  });
}

function isInside(point: GridPoint, width: number, depth: number): boolean {
  return point.x >= 0 && point.x < width && point.z >= 0 && point.z < depth;
}

function reconstructPath(
  goalKey: string,
  parents: ReadonlyMap<string, string>,
  states: ReadonlyMap<string, SearchState>,
): readonly GridPoint[] {
  const reversed: GridPoint[] = [];
  let currentKey: string | undefined = goalKey;
  while (currentKey !== undefined) {
    const state = states.get(currentKey);
    if (state === undefined) {
      break;
    }
    reversed.push(state.point);
    currentKey = parents.get(currentKey);
  }
  reversed.reverse();
  return reversed;
}
