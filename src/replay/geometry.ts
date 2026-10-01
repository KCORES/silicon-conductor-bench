import type {
  Direction,
  Pedestrian,
  Point,
  RoadNetwork,
  Trajectory,
  Vehicle,
} from "../core/types.js";
import type {
  ReplayCrosswalkGeometry,
  ReplayLaneGeometry,
  ReplayPedestrianPose,
  ReplayPose,
  ReplayScene,
  ReplayVec2,
  ReplayVehiclePose,
} from "./types.js";

const INBOUND_TRAVEL: Record<Direction, Point> = {
  NORTH: { x: 0, y: 1 },
  EAST: { x: -1, y: 0 },
  SOUTH: { x: 0, y: -1 },
  WEST: { x: 1, y: 0 },
};

const OUTBOUND_TRAVEL: Record<Direction, Point> = {
  NORTH: { x: 0, y: -1 },
  EAST: { x: 1, y: 0 },
  SOUTH: { x: 0, y: 1 },
  WEST: { x: -1, y: 0 },
};

export function headingFromDelta(dx: number, dz: number): number {
  if (dx === 0 && dz === 0) {
    return 0;
  }
  return Math.atan2(dx, dz);
}

export function lerpAngle(from: number, to: number, t: number): number {
  const twoPi = Math.PI * 2;
  let delta = ((to - from) % twoPi) + twoPi;
  delta = ((delta + Math.PI) % twoPi) - Math.PI;
  return from + delta * t;
}

export function interpolatePose(
  from: ReplayPose,
  to: ReplayPose,
  t: number,
): ReplayPose {
  return {
    x: from.x + (to.x - from.x) * t,
    z: from.z + (to.z - from.z) * t,
    heading: lerpAngle(from.heading, to.heading, t),
  };
}

export function createReplayScene(network: RoadNetwork): ReplayScene {
  const inboundLanes: ReplayLaneGeometry[] = [];
  for (const lane of [...network.inboundLanes.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    inboundLanes.push({
      id: lane.id,
      kind: "INBOUND",
      ...(lane.routeId === undefined ? {} : { routeId: lane.routeId }),
      direction: lane.direction,
      slots: buildStraightSlots(
        lane.anchor,
        INBOUND_TRAVEL[lane.direction],
        lane.capacitySlots,
        "inbound",
      ),
    });
  }

  const outboundLanes: ReplayLaneGeometry[] = [];
  for (const lane of [...network.outboundLanes.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    outboundLanes.push({
      id: lane.id,
      kind: "OUTBOUND",
      direction: lane.direction,
      slots: buildStraightSlots(
        lane.anchor,
        OUTBOUND_TRAVEL[lane.direction],
        lane.capacitySlots,
        "outbound",
      ),
    });
  }

  const trajectories: ReplayLaneGeometry[] = [...network.trajectories.values()]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((trajectory) => ({
      id: trajectory.id,
      kind: "TRAJECTORY" as const,
      routeId: trajectory.id,
      direction: trajectory.origin,
      slots: headingForPolyline(trajectory),
    }));

  const crosswalks = [...network.crosswalks.values()]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((crosswalk) => ({
      id: crosswalk.id,
      approach: crosswalk.approach,
      start: { x: crosswalk.start.x, z: crosswalk.start.y },
      end: { x: crosswalk.end.x, z: crosswalk.end.y },
      cells: crosswalk.cells
        .map((cell) => ({
          id: cell.id,
          conflictResourceId: cell.conflictResourceId,
          column: cell.column,
          row: cell.row,
          x: cell.x,
          z: cell.y,
        }))
        .sort((left, right) => left.column - right.column || left.row - right.row),
      waitingAreas: crosswalk.waitingAreas.map((area) => {
        const entrance = network.pedestrianCorners
          .get(area.cornerId)
          ?.entrances.find((candidate) => candidate.id === area.entryCellId);
        if (entrance === undefined) {
          throw new Error(`Missing replay entrance ${area.entryCellId}`);
        }
        return {
          id: area.id,
          direction: area.direction,
          cornerId: area.cornerId,
          entryCellId: area.entryCellId,
          entry: {
            id: entrance.id,
            x: entrance.x,
            z: entrance.y,
            worldSpace: true as const,
          },
          cells: area.cells
            .map((cell) => ({
              id: cell.id,
              latticeX: cell.latticeX,
              latticeZ: cell.latticeY,
              kind: cell.kind,
              worldSpace: true as const,
              x: cell.x,
              z: cell.y,
            }))
            .sort(
              (left, right) =>
                (left.kind === "WAITING_ZONE" ? 0 : 1) -
                  (right.kind === "WAITING_ZONE" ? 0 : 1) ||
                left.id.localeCompare(right.id),
            ),
        };
      }),
    }));

  const pedestrianCorners = [...network.pedestrianCorners.values()]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((corner) => ({
      id: corner.id,
      cells: corner.cells.map((cell) => ({
        id: cell.id,
        latticeX: cell.latticeX,
        latticeZ: cell.latticeY,
        kind: cell.kind,
        worldSpace: true as const,
        x: cell.x,
        z: cell.y,
      })),
      entrances: corner.entrances.map((entry) => ({
        id: entry.id,
        latticeX: entry.latticeX,
        latticeZ: entry.latticeY,
        worldSpace: true as const,
        x: entry.x,
        z: entry.y,
      })),
    }));
  const pedestrianApproachPaths = [...network.pedestrianApproachPaths.values()]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((path) => ({
      id: path.id,
      crosswalkId: path.crosswalkId,
      direction: path.direction,
      cornerId: path.cornerId,
      targetWaitingCellId: path.targetWaitingCellId,
      cells: path.cells.map((cell) => ({
        id: cell.id,
        index: cell.index,
        worldSpace: true as const,
        x: cell.x,
        z: cell.y,
      })),
    }));

  return {
    inboundLanes,
    outboundLanes,
    trajectories,
    crosswalks,
    pedestrianCorners,
    pedestrianApproachPaths,
    conflictResources: buildConflictResourceIndex(network, trajectories),
  };
}

export function resolveVehiclePose(
  vehicle: Vehicle,
  scene: ReplayScene,
): ReplayVehiclePose {
  const inbound = scene.inboundLanes.find(
    (lane) => lane.id === vehicle.inboundLaneId,
  );
  const trajectory = scene.trajectories.find(
    (lane) => lane.id === vehicle.routeId,
  );
  const outbound = scene.outboundLanes.find(
    (lane) => lane.id === vehicle.outboundLaneId,
  );
  if (inbound === undefined || trajectory === undefined || outbound === undefined) {
    throw new Error(`Missing geometry for vehicle ${vehicle.id}`);
  }

  const segments: ReplayPose[] = [];
  for (let offset = 0; offset < vehicle.lengthSlots; offset += 1) {
    segments.push(
      segmentPose(vehicle, offset, inbound, trajectory, outbound),
    );
  }
  const head = segments[0] ?? { x: 0, z: 0, heading: 0 };
  return {
    id: vehicle.id,
    type: vehicle.type,
    state: vehicle.state,
    routeId: vehicle.routeId,
    inboundLaneId: vehicle.inboundLaneId,
    outboundLaneId: vehicle.outboundLaneId,
    waitingTicks: vehicle.waitingTicks,
    ...(vehicle.incidentId === undefined
      ? {}
      : { incidentId: vehicle.incidentId }),
    ...(vehicle.admissionState === undefined
      ? {}
      : { admissionState: vehicle.admissionState }),
    ...(vehicle.violation === undefined ? {} : { violation: vehicle.violation }),
    x: head.x,
    z: head.z,
    heading: head.heading,
    segments,
  };
}

export function resolvePedestrianPoses(
  pedestrians: Iterable<Pedestrian>,
  scene: ReplayScene,
): ReplayPedestrianPose[] {
  const active = [...pedestrians]
    .filter((pedestrian) => pedestrian.state !== "CLEARED")
    .sort((left, right) => left.id.localeCompare(right.id));
  return active.map((pedestrian) => resolvePedestrianPose(pedestrian, scene));
}

export function resolvePedestrianPose(
  pedestrian: Pedestrian,
  scene: ReplayScene,
): ReplayPedestrianPose {
  const crosswalk = scene.crosswalks.find(
    (item) => item.id === pedestrian.crosswalkId,
  );
  if (crosswalk === undefined) {
    throw new Error(`Missing geometry for pedestrian ${pedestrian.id}`);
  }
  const pose =
    pedestrian.state === "APPROACHING"
      ? approachingPedestrianPose(pedestrian, scene)
      : pedestrian.state === "DEPARTING"
        ? departingPedestrianPose(pedestrian, scene, crosswalk)
      : pedestrian.state === "WAITING"
      ? waitingPedestrianPose(
          crosswalk,
          pedestrian.direction,
          pedestrian.waitingCellId,
          pedestrian.waitingSubslot,
          pedestrian.id,
        )
      : pedestrian.column === undefined
        ? crosswalkEntryPose(crosswalk, pedestrian.direction)
      : crosswalkCellPose(
          crosswalk,
          pedestrian.direction,
          pedestrian.row,
          pedestrian.column,
          pedestrian.id,
        );
  return {
    id: pedestrian.id,
    crosswalkId: pedestrian.crosswalkId,
    direction: pedestrian.direction,
    state: pedestrian.state,
    waitingTicks: pedestrian.waitingTicks,
    patienceLimit: pedestrian.patienceLimit,
    ...(pedestrian.incidentId === undefined
      ? {}
      : { incidentId: pedestrian.incidentId }),
    ...(pedestrian.row === undefined ? {} : { row: pedestrian.row }),
    ...(pedestrian.column === undefined ? {} : { column: pedestrian.column }),
    ...(pedestrian.cohortId === undefined
      ? {}
      : { cohortId: pedestrian.cohortId }),
    ...(pedestrian.waitingCellId === undefined
      ? {}
      : { waitingCellId: pedestrian.waitingCellId }),
    ...(pedestrian.waitingSubslot === undefined
      ? {}
      : { waitingSubslot: pedestrian.waitingSubslot }),
    ...(pedestrian.approachCellId === undefined
      ? {}
      : { approachCellId: pedestrian.approachCellId }),
    ...(pedestrian.approachPathId === undefined
      ? {}
      : { approachPathId: pedestrian.approachPathId }),
    ...(pedestrian.approachIndex === undefined
      ? {}
      : { approachIndex: pedestrian.approachIndex }),
    ...pose,
  };
}

function approachingPedestrianPose(
  pedestrian: Pedestrian,
  scene: ReplayScene,
): ReplayPose & { readonly worldSpace: true } {
  const path = scene.pedestrianApproachPaths?.find(
    (candidate) => candidate.id === pedestrian.approachPathId,
  );
  const index = pedestrian.approachIndex ?? 0;
  const cell = path?.cells[index];
  if (cell === undefined) {
    throw new Error(`Missing approach geometry for pedestrian ${pedestrian.id}`);
  }
  const next = path?.cells[index + 1];
  const previous = path?.cells[index - 1];
  const toward = next ?? cell;
  const from = next === undefined ? previous ?? cell : cell;
  return {
    x: cell.x,
    z: cell.z,
    heading: headingFromDelta(toward.x - from.x, toward.z - from.z),
    worldSpace: true,
  };
}

function departingPedestrianPose(
  pedestrian: Pedestrian,
  scene: ReplayScene,
  crosswalk: ReplayCrosswalkGeometry,
): ReplayPose & { readonly worldSpace: true } {
  const path = scene.pedestrianApproachPaths?.find(
    (candidate) => candidate.id === pedestrian.approachPathId,
  );
  if (path === undefined) {
    throw new Error(`Missing departure geometry for pedestrian ${pedestrian.id}`);
  }
  const index = pedestrian.approachIndex ?? path.cells.length;
  if (index >= path.cells.length) {
    const destinationDirection =
      pedestrian.direction === "A_TO_B" ? "B_TO_A" : "A_TO_B";
    const entry = crosswalk.waitingAreas
      ?.find((area) => area.direction === destinationDirection)
      ?.entry;
    const target = path.cells.at(-1);
    if (entry === undefined || target === undefined) {
      throw new Error(`Missing departure entry for pedestrian ${pedestrian.id}`);
    }
    return {
      x: entry.x,
      z: entry.z,
      heading: headingFromDelta(target.x - entry.x, target.z - entry.z),
      worldSpace: true,
    };
  }
  const cell = path.cells[index];
  const target = path.cells[Math.max(0, index - 1)];
  const previous = path.cells[Math.min(path.cells.length - 1, index + 1)];
  if (cell === undefined || target === undefined || previous === undefined) {
    throw new Error(`Missing departure cell for pedestrian ${pedestrian.id}`);
  }
  return {
    x: cell.x,
    z: cell.z,
    heading: headingFromDelta(
      target.x - previous.x,
      target.z - previous.z,
    ),
    worldSpace: true,
  };
}

export function resolveConflictResourcePosition(
  conflictResourceId: string,
  scene: ReplayScene,
): ReplayVec2 | undefined {
  return scene.conflictResources[conflictResourceId];
}

function segmentPose(
  vehicle: Vehicle,
  offset: number,
  inbound: ReplayLaneGeometry,
  trajectory: ReplayLaneGeometry,
  outbound: ReplayLaneGeometry,
): ReplayPose {
  if (vehicle.encroaching && vehicle.state === "AT_STOPLINE") {
    if (offset === 0) {
      return poseAt(trajectory.slots, 0);
    }
    return poseAt(inbound.slots, vehicle.inboundHeadSlot - (offset - 1));
  }
  if (isInboundState(vehicle.state)) {
    return poseAt(inbound.slots, vehicle.inboundHeadSlot - offset);
  }
  if (vehicle.state === "OUTBOUND") {
    return poseAt(outbound.slots, vehicle.outboundHeadSlot - offset);
  }

  const index = vehicle.trajectoryHeadSlot - offset;
  if (index < 0) {
    return poseAt(inbound.slots, inbound.slots.length + index);
  }
  if (index >= trajectory.slots.length) {
    return poseAt(outbound.slots, index - trajectory.slots.length);
  }
  return poseAt(trajectory.slots, index);
}

function poseAt(slots: readonly ReplayPose[], index: number): ReplayPose {
  if (slots.length === 0) {
    return { x: 0, z: 0, heading: 0 };
  }
  if (index < 0) {
    const first = slots[0];
    if (first === undefined) {
      return { x: 0, z: 0, heading: 0 };
    }
    const travel = travelFromHeading(first.heading);
    return {
      x: first.x + travel.x * index,
      z: first.z + travel.z * index,
      heading: first.heading,
    };
  }
  if (index >= slots.length) {
    const last = slots[slots.length - 1];
    if (last === undefined) {
      return { x: 0, z: 0, heading: 0 };
    }
    const travel = travelFromHeading(last.heading);
    const extra = index - (slots.length - 1);
    return {
      x: last.x + travel.x * extra,
      z: last.z + travel.z * extra,
      heading: last.heading,
    };
  }
  return slots[index] ?? { x: 0, z: 0, heading: 0 };
}

function buildStraightSlots(
  anchor: Point,
  travel: Point,
  capacity: number,
  mode: "inbound" | "outbound",
): ReplayPose[] {
  const heading = headingFromDelta(travel.x, travel.y);
  const slots: ReplayPose[] = [];
  for (let index = 0; index < capacity; index += 1) {
    const steps =
      mode === "inbound" ? -(capacity - 1 - index) : index;
    slots.push({
      x: anchor.x + travel.x * steps,
      z: anchor.y + travel.y * steps,
      heading,
    });
  }
  return slots;
}

function headingForPolyline(trajectory: Trajectory): ReplayPose[] {
  return trajectory.slots.map((slot, index) => {
    const previous = trajectory.slots[index - 1];
    const next = trajectory.slots[index + 1];
    const from = previous ?? slot;
    const to = next ?? slot;
    const heading =
      previous !== undefined
        ? headingFromDelta(slot.x - previous.x, slot.y - previous.y)
        : headingFromDelta(to.x - from.x, to.y - from.y);
    return {
      x: slot.x,
      z: slot.y,
      heading,
      slotKey: slot.slotId,
      conflictResourceIds: [...slot.conflictResourceIds].sort(),
    };
  });
}

function buildConflictResourceIndex(
  network: RoadNetwork,
  trajectories: readonly ReplayLaneGeometry[],
): Record<string, ReplayVec2> {
  const byRoute = new Map(
    trajectories.map((trajectory) => [trajectory.id, trajectory.slots]),
  );
  const index: Record<string, ReplayVec2> = {};

  for (const trajectory of network.trajectories.values()) {
    for (const slot of trajectory.slots) {
      for (const resourceId of slot.conflictResourceIds) {
        if (resourceId.startsWith("SPACE:")) {
          const parts = resourceId.split(":");
          const x = Number(parts[1]);
          const y = Number(parts[2]);
          if (Number.isFinite(x) && Number.isFinite(y)) {
            index[resourceId] = { x, z: y };
          }
          continue;
        }
        if (!resourceId.startsWith("PAIR:") || index[resourceId] !== undefined) {
          continue;
        }
        const midpoint = pairMidpoint(resourceId, byRoute);
        if (midpoint !== undefined) {
          index[resourceId] = midpoint;
        }
      }
    }
  }
  for (const crosswalk of network.crosswalks.values()) {
    for (const cell of crosswalk.cells) {
      index[cell.conflictResourceId] = { x: cell.x, z: cell.y };
    }
  }
  return index;
}

function crosswalkEntryPose(
  crosswalk: ReplayCrosswalkGeometry,
  direction: Pedestrian["direction"],
): ReplayPose & { readonly worldSpace?: boolean } {
  const area = crosswalk.waitingAreas?.find(
    (candidate) => candidate.direction === direction,
  );
  if (area?.entry !== undefined) {
    const dx = crosswalk.end.x - crosswalk.start.x;
    const dz = crosswalk.end.z - crosswalk.start.z;
    return {
      x: area.entry.x,
      z: area.entry.z,
      heading:
        direction === "A_TO_B"
          ? headingFromDelta(dx, dz)
          : headingFromDelta(-dx, -dz),
      worldSpace: true,
    };
  }
  throw new Error(
    `Missing crosswalk entry geometry for ${crosswalk.id}:${direction}`,
  );
}

function waitingPedestrianPose(
  crosswalk: ReplayCrosswalkGeometry,
  direction: Pedestrian["direction"],
  waitingCellId?: string,
  waitingSubslot?: number,
  pedestrianId?: string,
): ReplayPose & { readonly worldSpace?: boolean } {
  const waitingCell = crosswalk.waitingAreas
    ?.find((area) => area.direction === direction)
    ?.cells.find((cell) => cell.id === waitingCellId);
  if (waitingCell !== undefined) {
    const dx = crosswalk.end.x - crosswalk.start.x;
    const dz = crosswalk.end.z - crosswalk.start.z;
    const subslot = Math.max(0, Math.min(8, waitingSubslot ?? 0));
    const offsetX = ((subslot % 3) - 1) * 0.42;
    const offsetZ = (Math.floor(subslot / 3) - 1) * 0.42;
    const jitterX = pedestrianVisualNoise(pedestrianId, 0) * 0.12;
    const jitterZ = pedestrianVisualNoise(pedestrianId, 1) * 0.12;
    const headingJitter = pedestrianVisualNoise(pedestrianId, 2) * 0.45;
    return {
      x: waitingCell.x + offsetX + jitterX,
      z: waitingCell.z + offsetZ + jitterZ,
      heading:
        (direction === "A_TO_B"
          ? headingFromDelta(dx, dz)
          : headingFromDelta(-dx, -dz)) + headingJitter,
      ...(waitingCell.worldSpace === true ? { worldSpace: true } : {}),
    };
  }
  throw new Error(
    `Missing waiting cell geometry for pedestrian ${pedestrianId ?? "unknown"} at ${crosswalk.id}:${direction}`,
  );
}

function pedestrianVisualNoise(
  pedestrianId: string | undefined,
  salt: number,
): number {
  if (pedestrianId === undefined) {
    return 0;
  }
  let hash = (0x811c9dc5 ^ salt) >>> 0;
  for (let index = 0; index < pedestrianId.length; index += 1) {
    hash ^= pedestrianId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash / 0xffffffff) * 2 - 1;
}

function crosswalkCellPose(
  crosswalk: ReplayCrosswalkGeometry,
  direction: Pedestrian["direction"],
  row: 0 | 1 | undefined,
  column: number | undefined,
  pedestrianId: string,
): ReplayPose {
  if (row === undefined || column === undefined) {
    throw new Error(`Missing crosswalk cell for pedestrian ${pedestrianId}`);
  }
  const cell = crosswalk.cells?.find(
    (item) => item.row === row && item.column === column,
  );
  if (cell === undefined) {
    throw new Error(`Missing crosswalk cell for pedestrian ${pedestrianId}`);
  }
  const dx = crosswalk.end.x - crosswalk.start.x;
  const dz = crosswalk.end.z - crosswalk.start.z;
  const directionScale = direction === "A_TO_B" ? 1 : -1;
  return {
    x: cell.x,
    z: cell.z,
    heading: headingFromDelta(dx * directionScale, dz * directionScale),
  };
}

function pairMidpoint(
  resourceId: string,
  byRoute: ReadonlyMap<string, readonly ReplayPose[]>,
): ReplayVec2 | undefined {
  const body = resourceId.slice("PAIR:".length);
  const [leftRaw, rightRaw] = body.split("|");
  if (leftRaw === undefined || rightRaw === undefined) {
    return undefined;
  }
  const left = parseRouteSlot(leftRaw);
  const right = parseRouteSlot(rightRaw);
  if (left === undefined || right === undefined) {
    return undefined;
  }
  const leftPose = byRoute.get(left.routeId)?.[left.index];
  const rightPose = byRoute.get(right.routeId)?.[right.index];
  if (leftPose === undefined || rightPose === undefined) {
    return undefined;
  }
  return {
    x: (leftPose.x + rightPose.x) / 2,
    z: (leftPose.z + rightPose.z) / 2,
  };
}

function parseRouteSlot(
  value: string,
): { routeId: string; index: number } | undefined {
  const separator = value.lastIndexOf(":");
  if (separator <= 0) {
    return undefined;
  }
  const routeId = value.slice(0, separator);
  const index = Number(value.slice(separator + 1));
  if (!Number.isInteger(index)) {
    return undefined;
  }
  return { routeId, index };
}

function travelFromHeading(heading: number): ReplayVec2 {
  return { x: Math.sin(heading), z: Math.cos(heading) };
}

function isInboundState(state: Vehicle["state"]): boolean {
  return (
    state === "GENERATED" ||
    state === "APPROACHING" ||
    state === "QUEUED" ||
    state === "AT_STOPLINE" ||
    state === "STALLED"
  );
}
