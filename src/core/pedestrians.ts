import type {
  ConflictResourceId,
  CrosswalkCell,
  CrosswalkZone,
  Pedestrian,
  PedestrianDirection,
  TickNumber,
} from "./types.js";

export const PEDESTRIAN_MIN_PATIENCE = 40;
export const PEDESTRIAN_MAX_PATIENCE = 60;
export const PEDESTRIAN_TICKS_PER_CELL = 4;
export const PEDESTRIAN_ARRIVAL_RATE_DENOMINATOR = 20;
export const PEDESTRIAN_PHASE_BATCH_CAP = 8;
export const PEDESTRIAN_WARNING_REMAINING_TICKS = 24;
export const PEDESTRIAN_SUBSLOTS_PER_CELL = 9;
export const PEDESTRIAN_WAITING_AREA_CAPACITY =
  4 * PEDESTRIAN_SUBSLOTS_PER_CELL;
export const PEDESTRIAN_VISIBLE_CORNER_CAPACITY =
  10 * PEDESTRIAN_SUBSLOTS_PER_CELL;

export interface ScheduledPedestrianArrival {
  readonly id: string;
  readonly tick: TickNumber;
  readonly slot: number;
  readonly crosswalkId: ConflictResourceId;
  readonly direction: PedestrianDirection;
}

export interface PedestrianDirectionQueues {
  readonly A_TO_B: readonly Pedestrian[];
  readonly B_TO_A: readonly Pedestrian[];
}

export interface PedestrianTimelineStep {
  readonly cell: CrosswalkCell;
  readonly enterTickOffset: number;
  readonly leaveTickOffset: number;
  readonly resourceIds: readonly ConflictResourceId[];
}

export function pedestrianPatienceLimit(
  seed: number,
  pedestrianId: string,
): number {
  assertIntegerSeed(seed);
  if (pedestrianId.length === 0) {
    throw new Error("Pedestrian id must not be empty");
  }
  const range = PEDESTRIAN_MAX_PATIENCE - PEDESTRIAN_MIN_PATIENCE + 1;
  return PEDESTRIAN_MIN_PATIENCE + (hashSeed(seed, pedestrianId) % range);
}

export function pedestrianArrivalsAt(
  seed: number,
  tick: TickNumber,
  crosswalkIds: readonly ConflictResourceId[],
): readonly ScheduledPedestrianArrival[] {
  assertIntegerSeed(seed);
  if (!Number.isInteger(tick) || tick < 0) {
    throw new Error(`Pedestrian demand tick must be a non-negative integer: ${tick}`);
  }

  const arrivals: ScheduledPedestrianArrival[] = [];
  for (const crosswalkId of [...new Set(crosswalkIds)].sort()) {
    const demandHash = hashSeed(seed, `${tick}:${crosswalkId}:arrival`);
    if (demandHash % PEDESTRIAN_ARRIVAL_RATE_DENOMINATOR !== 0) {
      continue;
    }
    const slot = arrivals.length;
    arrivals.push({
      id: `PED:${tick}:${slot}:${crosswalkId}`,
      tick,
      slot,
      crosswalkId,
      direction:
        hashSeed(seed, `${tick}:${crosswalkId}:direction`) % 2 === 0
          ? "A_TO_B"
          : "B_TO_A",
    });
  }
  return arrivals;
}

export function createPedestrian(
  seed: number,
  arrival: ScheduledPedestrianArrival,
): Pedestrian {
  return {
    id: arrival.id,
    crosswalkId: arrival.crosswalkId,
    direction: arrival.direction,
    generatedAtTick: arrival.tick,
    patienceLimit: pedestrianPatienceLimit(seed, arrival.id),
    state: "APPROACHING",
    waitingTicks: 0,
  };
}

export function createPedestrianDirectionQueues(
  pedestrians: readonly Pedestrian[] = [],
): PedestrianDirectionQueues {
  const byArrival = [...pedestrians].sort(
    (left, right) =>
      left.generatedAtTick - right.generatedAtTick ||
      left.id.localeCompare(right.id),
  );
  return {
    A_TO_B: byArrival.filter(
      (pedestrian) => pedestrian.direction === "A_TO_B",
    ),
    B_TO_A: byArrival.filter(
      (pedestrian) => pedestrian.direction === "B_TO_A",
    ),
  };
}

export function enqueuePedestrian(
  queues: PedestrianDirectionQueues,
  pedestrian: Pedestrian,
): PedestrianDirectionQueues {
  return createPedestrianDirectionQueues([
    ...queues.A_TO_B,
    ...queues.B_TO_A,
    pedestrian,
  ]);
}

export function pedestrianPath(
  crosswalk: CrosswalkZone,
  direction: PedestrianDirection,
  row: 0 | 1,
): readonly CrosswalkCell[] {
  const cells = crosswalk.cells
    .filter((cell) => cell.row === row)
    .sort((left, right) => left.column - right.column);
  if (cells.length !== 8) {
    throw new Error(
      `Crosswalk ${crosswalk.id} row ${row} must contain exactly 8 cells`,
    );
  }
  return direction === "A_TO_B" ? cells : cells.reverse();
}

export function normalPedestrianTimeline(
  crosswalk: CrosswalkZone,
  direction: PedestrianDirection,
  row: 0 | 1,
): readonly PedestrianTimelineStep[] {
  return pedestrianPath(crosswalk, direction, row).map((cell, index) => {
    const enterTickOffset = index * PEDESTRIAN_TICKS_PER_CELL;
    return {
      cell,
      enterTickOffset,
      leaveTickOffset: enterTickOffset + PEDESTRIAN_TICKS_PER_CELL,
      resourceIds: [cell.conflictResourceId],
    };
  });
}

function assertIntegerSeed(seed: number): void {
  if (!Number.isInteger(seed)) {
    throw new Error(`Simulation seed must be an integer: ${seed}`);
  }
}

function hashSeed(seed: number, value: string): number {
  let hash = (seed ^ 0x811c9dc5) >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
  return (hash ^ (hash >>> 16)) >>> 0;
}
