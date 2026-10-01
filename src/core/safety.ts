import type {
  AdmissionBatchResult,
  AdmissionRejectionReason,
  AdmissionResult,
  CandidateConflict,
  DryRunAdmissionResult,
  PedestrianId,
  ReservationTable,
  RoadNetwork,
  TickNumber,
  Trajectory,
  TrajectorySlot,
  Vehicle,
  VehicleId,
} from "./types.js";
import type { PedestrianTimelineStep } from "./pedestrians.js";
import {
  commitVehicleMotion,
  previewVehicleMotion,
  sweptHeadSlots,
} from "./motion.js";

export interface ScheduledCollision {
  readonly tick: TickNumber;
  readonly resourceId: string;
  readonly vehicleIds: readonly VehicleId[];
  readonly pedestrianIds?: readonly PedestrianId[];
}

export interface AdmissionControl {
  readonly mode?: "DRY_RUN" | "COMMIT";
  readonly lockedResourceIds?: ReadonlySet<string>;
  readonly heldInboundLaneIds?: ReadonlySet<string>;
  readonly exitBlockedResourceIds?: ReadonlySet<string>;
  readonly creepOccupations?: ReadonlyMap<string, VehicleId>;
  readonly slowStartSteps?: number;
  readonly controlResourceBlocked?: (
    resourceId: string,
    routeId: string,
    tick: number,
  ) => boolean;
  readonly routeAuthorized?: (
    vehicle: Vehicle,
    trajectory: Trajectory,
  ) => boolean;
}

export interface ReservationTransaction {
  readonly batch: AdmissionBatchResult;
  readonly reservationTable: ReservationTable;
  readonly scheduledCollisions: readonly ScheduledCollision[];
}

export const RESERVATION_PROBE_HORIZON = 48;

interface ConflictDetails {
  readonly vehicleId: VehicleId;
  readonly tick: TickNumber;
  readonly resourceId: string;
}

export interface PedestrianReservationConflict {
  readonly actorId: string;
  readonly tick: TickNumber;
  readonly resourceId: string;
}

export function transactAdmissions(
  requestedVehicleIds: readonly VehicleId[],
  currentTick: TickNumber,
  vehicles: ReadonlyMap<VehicleId, Vehicle>,
  laneHeadVehicleIds: ReadonlyMap<string, VehicleId>,
  network: RoadNetwork,
  currentReservations: ReservationTable,
  control: AdmissionControl = {},
): ReservationTransaction {
  const mode = control.mode ?? "DRY_RUN";
  const lockedResourceIds = control.lockedResourceIds ?? new Set<string>();
  const heldInboundLaneIds = control.heldInboundLaneIds ?? new Set<string>();
  const exitBlockedResourceIds = control.exitBlockedResourceIds ?? new Set<string>();
  const commitTable = cloneReservationTable(currentReservations);
  const probeTable = cloneReservationTable(currentReservations);
  const requested = new Set(requestedVehicleIds);
  const probeOccupations = new Map(
    [...(control.creepOccupations ?? new Map()).entries()].filter(
      ([, owner]) => !requested.has(owner),
    ),
  );
  paintOccupations(
    probeTable,
    probeOccupations,
    currentTick,
    RESERVATION_PROBE_HORIZON,
  );
  const seen = new Set<VehicleId>();
  const results: AdmissionResult[] = [];
  const scheduledCollisions: ScheduledCollision[] = [];

  for (const vehicleId of requestedVehicleIds) {
    if (seen.has(vehicleId)) {
      results.push(rejection(vehicleId, "DUPLICATE_REQUEST"));
      continue;
    }
    seen.add(vehicleId);

    const vehicle = vehicles.get(vehicleId);
    if (vehicle === undefined) {
      results.push(rejection(vehicleId, "UNKNOWN_VEHICLE"));
      continue;
    }
    if (vehicle.state === "STALLED") {
      results.push(rejection(vehicleId, "STALLED"));
      continue;
    }
    if (vehicle.state !== "AT_STOPLINE") {
      results.push(rejection(vehicleId, "NOT_AT_STOPLINE"));
      continue;
    }
    if (laneHeadVehicleIds.get(vehicle.inboundLaneId) !== vehicleId) {
      results.push(rejection(vehicleId, "NOT_LANE_HEAD"));
      continue;
    }

    const trajectory = network.trajectories.get(vehicle.routeId);
    if (trajectory === undefined) {
      results.push(rejection(vehicleId, "UNKNOWN_ROUTE"));
      continue;
    }
    if (
      control.routeAuthorized !== undefined &&
      !control.routeAuthorized(vehicle, trajectory)
    ) {
      results.push(rejection(vehicleId, "MANEUVER_NOT_PERMITTED"));
      continue;
    }
    if (trajectory.inboundLaneId !== vehicle.inboundLaneId) {
      results.push(rejection(vehicleId, "LANE_ROUTE_MISMATCH"));
      continue;
    }
    if (heldInboundLaneIds.has(vehicle.inboundLaneId)) {
      results.push(rejection(vehicleId, "LANE_HELD"));
      continue;
    }
    if (trajectoryUsesResources(trajectory.slots, lockedResourceIds)) {
      results.push(rejection(vehicleId, "ROUTE_SEVERED"));
      continue;
    }
    if (trajectoryUsesResources(trajectory.slots, exitBlockedResourceIds)) {
      results.push(rejection(vehicleId, "EXIT_FULL"));
      continue;
    }
    if (
      control.controlResourceBlocked !== undefined &&
      vehicleOccupationTimeline(
        vehicle,
        trajectory.slots,
        control.slowStartSteps,
      ).some((occupation) =>
        [...occupation.controlResourceIds].some((resourceId) =>
          control.controlResourceBlocked?.(
            resourceId,
            trajectory.id,
            currentTick + occupation.tickOffset,
          ),
        ),
      )
    ) {
      results.push(rejection(vehicleId, "CROSSWALK"));
      continue;
    }

    const conflict = findReservationConflict(
      vehicle,
      trajectory.slots,
      currentTick,
      probeTable,
      control.slowStartSteps,
    );
    if (conflict !== undefined) {
      if (mode === "COMMIT") {
        const conflictingVehicle = vehicles.has(conflict.vehicleId);
        scheduledCollisions.push({
          tick: conflict.tick,
          resourceId: conflict.resourceId,
          vehicleIds: conflictingVehicle
            ? [vehicleId, conflict.vehicleId].sort()
            : [vehicleId],
          ...(conflictingVehicle
            ? {}
            : { pedestrianIds: [conflict.vehicleId] }),
        });
        results.push({ vehicleId, status: "ADMITTED" });
        continue;
      }
      results.push({
        vehicleId,
        status: "SAFETY_REJECTED",
        reason: "RESOURCE_CONFLICT",
        conflictingVehicleId: conflict.vehicleId,
        conflictingTick: conflict.tick,
        conflictingResourceId: conflict.resourceId,
      });
      continue;
    }

    writeVehicleReservation(
      vehicle,
      trajectory.slots,
      currentTick,
      probeTable,
      control.slowStartSteps,
    );
    writeVehicleReservation(
      vehicle,
      trajectory.slots,
      currentTick,
      commitTable,
      control.slowStartSteps,
    );
    results.push({ vehicleId, status: "ADMITTED" });
  }

  const admittedVehicleIds = results
    .filter((result) => result.status === "ADMITTED")
    .map((result) => result.vehicleId);
  const rejectedVehicleIds = results
    .filter((result) => result.status === "SAFETY_REJECTED")
    .map((result) => result.vehicleId);

  return {
    batch: {
      tick: currentTick,
      results,
      admittedVehicleIds,
      rejectedVehicleIds,
    },
    reservationTable: commitTable,
    scheduledCollisions,
  };
}

export function dryRunAdmissions(
  requestedVehicleIds: readonly VehicleId[],
  currentTick: TickNumber,
  vehicles: ReadonlyMap<VehicleId, Vehicle>,
  laneHeadVehicleIds: ReadonlyMap<string, VehicleId>,
  network: RoadNetwork,
  currentReservations: ReservationTable,
  rewardForVehicle: (vehicle: Vehicle) => number = () => 0,
  control: AdmissionControl = {},
): DryRunAdmissionResult {
  // transactAdmissions deep-clones every live reservation tick before testing.
  // The returned table is intentionally discarded so this operation is pure.
  const transaction = transactAdmissions(
    requestedVehicleIds,
    currentTick,
    vehicles,
    laneHeadVehicleIds,
    network,
    currentReservations,
    { ...control, mode: "DRY_RUN" },
  );
  const conflictResult = transaction.batch.results.find(
    (result) => result.reason === "RESOURCE_CONFLICT",
  );
  const feasible =
    transaction.batch.rejectedVehicleIds.length === 0 &&
    transaction.batch.admittedVehicleIds.length === requestedVehicleIds.length;

  return {
    feasible,
    estimatedFlowReward: feasible
      ? transaction.batch.admittedVehicleIds.reduce((sum, vehicleId) => {
          const vehicle = vehicles.get(vehicleId);
          return vehicle === undefined ? sum : sum + rewardForVehicle(vehicle);
        }, 0)
      : 0,
    batch: transaction.batch,
    ...(conflictResult?.conflictingTick !== undefined &&
    conflictResult.conflictingResourceId !== undefined &&
    conflictResult.conflictingVehicleId !== undefined
      ? {
          conflictDetected: {
            tickOffset: conflictResult.conflictingTick - currentTick,
            conflictResourceId: conflictResult.conflictingResourceId,
            conflictingVehicles: [
              conflictResult.vehicleId,
              conflictResult.conflictingVehicleId,
            ],
          },
        }
      : {}),
  };
}

export function pruneReservationTable(
  reservations: ReservationTable,
  currentTick: TickNumber,
): void {
  for (const tick of reservations.keys()) {
    if (tick < currentTick) {
      reservations.delete(tick);
    }
  }
}

export function findCandidateConflicts(
  candidates: readonly Vehicle[],
  currentTick: TickNumber,
  network: RoadNetwork,
): CandidateConflict[] {
  const conflicts: CandidateConflict[] = [];

  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    const left = candidates[leftIndex];
    if (left === undefined) {
      continue;
    }
    const leftTrajectory = network.trajectories.get(left.routeId);
    if (leftTrajectory === undefined) {
      continue;
    }
    const leftTable: ReservationTable = new Map();
    writeVehicleReservation(left, leftTrajectory.slots, currentTick, leftTable);

    for (
      let rightIndex = leftIndex + 1;
      rightIndex < candidates.length;
      rightIndex += 1
    ) {
      const right = candidates[rightIndex];
      if (right === undefined) {
        continue;
      }
      const rightTrajectory = network.trajectories.get(right.routeId);
      if (rightTrajectory === undefined) {
        continue;
      }
      if (
        findReservationConflict(
          right,
          rightTrajectory.slots,
          currentTick,
          leftTable,
        ) !== undefined
      ) {
        conflicts.push({
          vehicleIdA: left.id,
          vehicleIdB: right.id,
        });
      }
    }
  }

  return conflicts;
}

export function routeBlockedUntilTick(
  vehicle: Vehicle,
  currentTick: TickNumber,
  network: RoadNetwork,
  reservations: ReservationTable,
): TickNumber | undefined {
  const trajectory = network.trajectories.get(vehicle.routeId);
  if (trajectory === undefined) {
    return currentTick;
  }

  let blockedUntil: number | undefined;
  for (let enterTick = currentTick; enterTick <= currentTick + 64; enterTick += 1) {
    const conflict = findReservationConflict(
      vehicle,
      trajectory.slots,
      enterTick,
      reservations,
    );
    if (conflict === undefined) {
      return blockedUntil;
    }
    blockedUntil = Math.max(blockedUntil ?? conflict.tick, conflict.tick);
  }

  return blockedUntil;
}

function rejection(
  vehicleId: VehicleId,
  reason: Exclude<AdmissionRejectionReason, "RESOURCE_CONFLICT">,
): AdmissionResult {
  return { vehicleId, status: "SAFETY_REJECTED", reason };
}

export function cloneReservationTable(source: ReservationTable): ReservationTable {
  return new Map(
    [...source.entries()].map(([tick, resources]) => [
      tick,
      new Map(resources),
    ]),
  );
}

export function findPedestrianReservationConflict(
  pedestrianId: PedestrianId,
  timeline: readonly PedestrianTimelineStep[],
  enterTick: TickNumber,
  reservations: ReservationTable,
): PedestrianReservationConflict | undefined {
  for (const step of timeline) {
    for (
      let offset = step.enterTickOffset;
      offset < step.leaveTickOffset;
      offset += 1
    ) {
      const tickResources = reservations.get(enterTick + offset);
      if (tickResources === undefined) {
        continue;
      }
      for (const resourceId of step.resourceIds) {
        const actorId = tickResources.get(resourceId);
        if (actorId !== undefined && actorId !== pedestrianId) {
          return { actorId, tick: enterTick + offset, resourceId };
        }
      }
    }
  }
  return undefined;
}

export function writePedestrianReservation(
  pedestrianId: PedestrianId,
  timeline: readonly PedestrianTimelineStep[],
  enterTick: TickNumber,
  reservations: ReservationTable,
): void {
  for (const step of timeline) {
    for (
      let offset = step.enterTickOffset;
      offset < step.leaveTickOffset;
      offset += 1
    ) {
      const tick = enterTick + offset;
      const tickResources = reservations.get(tick) ?? new Map();
      for (const resourceId of step.resourceIds) {
        tickResources.set(resourceId, pedestrianId);
      }
      reservations.set(tick, tickResources);
    }
  }
}

export function paintOccupations(
  reservations: ReservationTable,
  occupations: ReadonlyMap<string, VehicleId>,
  fromTick: TickNumber,
  horizon: number,
): void {
  if (occupations.size === 0) {
    return;
  }
  for (let tick = fromTick; tick < fromTick + horizon; tick += 1) {
    const tickResources = reservations.get(tick) ?? new Map<string, VehicleId>();
    for (const [resourceId, owner] of occupations) {
      if (!tickResources.has(resourceId)) {
        tickResources.set(resourceId, owner);
      }
    }
    reservations.set(tick, tickResources);
  }
}

export function findReservationConflict(
  vehicle: Vehicle,
  slots: readonly TrajectorySlot[],
  enterTick: TickNumber,
  reservations: ReservationTable,
  slowStartSteps = 2,
): ConflictDetails | undefined {
  for (const occupation of vehicleOccupationTimeline(
    vehicle,
    slots,
    slowStartSteps,
  )) {
    const tickResources = reservations.get(enterTick + occupation.tickOffset);
    if (tickResources === undefined) {
      continue;
    }

    for (const resourceId of occupation.resourceIds) {
      const owner = tickResources.get(resourceId);
      if (owner !== undefined && owner !== vehicle.id) {
        return {
          vehicleId: owner,
          tick: enterTick + occupation.tickOffset,
          resourceId,
        };
      }
    }
  }

  return undefined;
}

export function writeVehicleReservation(
  vehicle: Vehicle,
  slots: readonly TrajectorySlot[],
  enterTick: TickNumber,
  reservations: ReservationTable,
  slowStartSteps = 2,
): void {
  for (const occupation of vehicleOccupationTimeline(
    vehicle,
    slots,
    slowStartSteps,
  )) {
    const tick = enterTick + occupation.tickOffset;
    const tickResources = reservations.get(tick) ?? new Map<string, VehicleId>();
    for (const resourceId of occupation.resourceIds) {
      tickResources.set(resourceId, vehicle.id);
    }
    reservations.set(tick, tickResources);
  }
}

/** Claims only unowned resources, so an existing owner keeps the cell it will collide in. */
export function writeVehicleReservationWhereFree(
  vehicle: Vehicle,
  slots: readonly TrajectorySlot[],
  enterTick: TickNumber,
  reservations: ReservationTable,
  slowStartSteps = 2,
): void {
  for (const occupation of vehicleOccupationTimeline(
    vehicle,
    slots,
    slowStartSteps,
  )) {
    const tick = enterTick + occupation.tickOffset;
    const tickResources = reservations.get(tick) ?? new Map<string, VehicleId>();
    for (const resourceId of occupation.resourceIds) {
      if (!tickResources.has(resourceId)) {
        tickResources.set(resourceId, vehicle.id);
      }
    }
    reservations.set(tick, tickResources);
  }
}

export interface VehicleOccupation {
  readonly tickOffset: number;
  readonly headSlot: number;
  readonly resourceIds: ReadonlySet<string>;
  readonly controlResourceIds: ReadonlySet<string>;
}

/**
 * Returns the exact conflict-resource footprint for every physical tick from
 * admission until the tail has cleared the trajectory.
 */
export function vehicleOccupationTimeline(
  vehicle: Vehicle,
  slots: readonly TrajectorySlot[],
  slowStartSteps = 2,
): VehicleOccupation[] {
  const timeline: VehicleOccupation[] = [];
  const maneuver = vehicle.routeId.includes("_LEFT")
    ? "LEFT"
    : vehicle.routeId.includes("_RIGHT")
      ? "RIGHT"
      : "STRAIGHT";
  let tickOffset = 0;
  let headSlot = 0;
  const simulated: Vehicle = {
    ...vehicle,
    trajectoryHeadSlot: headSlot,
    speedProfile: vehicle.speedProfile ?? "CRUISE",
    motionCreditHalfSlots: vehicle.motionCreditHalfSlots ?? 0,
  };

  while (headSlot - vehicle.lengthSlots + 1 < slots.length) {
    const motion = previewVehicleMotion(simulated, maneuver, slowStartSteps);
    const swept = sweptHeadSlots(headSlot, motion.displacement);
    const resourceIds = new Set(
      swept.flatMap((pose) => [...resourcesAtHeadSlot(vehicle, slots, pose)]),
    );
    const controlResourceIds = new Set(
      swept.flatMap((pose) => [
        ...controlResourcesAtHeadSlot(vehicle, slots, pose),
      ]),
    );
    if (resourceIds.size > 0) {
      timeline.push({
        tickOffset,
        headSlot,
        resourceIds,
        controlResourceIds,
      });
    }
    tickOffset += 1;
    commitVehicleMotion(simulated, motion);
    headSlot += motion.displacement;
    simulated.trajectoryHeadSlot = headSlot;
  }
  return timeline;
}

export function resourcesCoveredByVehicle(
  vehicle: Vehicle,
  slots: readonly TrajectorySlot[],
): string[] {
  const resources = new Set<string>();
  for (let bodyOffset = 0; bodyOffset < vehicle.lengthSlots; bodyOffset += 1) {
    const slot = slots[vehicle.trajectoryHeadSlot - bodyOffset];
    if (slot === undefined) {
      continue;
    }
    for (const resourceId of slot.conflictResourceIds) {
      resources.add(resourceId);
    }
  }
  return [...resources].sort();
}

export function trajectoryUsesResources(
  slots: readonly TrajectorySlot[],
  resourceIds: ReadonlySet<string>,
): boolean {
  if (resourceIds.size === 0) {
    return false;
  }
  for (const slot of slots) {
    for (const resourceId of slot.conflictResourceIds) {
      if (resourceIds.has(resourceId)) {
        return true;
      }
    }
  }
  return false;
}

function resourcesAtHeadSlot(
  vehicle: Vehicle,
  slots: readonly TrajectorySlot[],
  headSlot: number,
): Set<string> {
  const resources = new Set<string>();
  for (let bodyOffset = 0; bodyOffset < vehicle.lengthSlots; bodyOffset += 1) {
    const slot = slots[headSlot - bodyOffset];
    if (slot === undefined) {
      continue;
    }
    for (const resourceId of slot.conflictResourceIds) {
      resources.add(resourceId);
    }
  }

  return resources;
}

function controlResourcesAtHeadSlot(
  vehicle: Vehicle,
  slots: readonly TrajectorySlot[],
  headSlot: number,
): Set<string> {
  const resources = new Set<string>();
  for (let bodyOffset = 0; bodyOffset < vehicle.lengthSlots; bodyOffset += 1) {
    const slot = slots[headSlot - bodyOffset];
    if (slot === undefined) {
      continue;
    }
    for (const resourceId of slot.controlResourceIds) {
      resources.add(resourceId);
    }
  }
  return resources;
}
