import type {
  CompactObservation,
  CrosswalkDirectionSummary,
  LaneId,
  SpatialSnapshot,
  SpeedProfile,
  StalledVehicleView,
} from "../core/types.js";
import { passengersFor } from "../core/vehicleRoster.js";
import { encodeCrosswalk, encodeLane, vehicleLetter } from "./spatial-encoding.js";

export interface ModelSpatialContext {
  readonly snapshot: SpatialSnapshot;
  /** Vehicles per inbound lane at the previous model cycle; drives `netChange`. */
  readonly previousLaneCounts?: ReadonlyMap<LaneId, number>;
}

const PROFILE_LETTERS: Record<SpeedProfile, string> = {
  SLOW_SLIDE: "S",
  CRUISE: "C",
  BURST: "B",
};

const TEMPERAMENT_LETTERS = { AGGRESSIVE: "A", NORMAL: "N", CALM: "C" } as const;

const MOTION_STATE_CODES = {
  CROSSING: "X",
  EXIT_BLOCKED: "EB",
  SCHEDULED_ENTERING: "SE",
} as const;

export function speedProfileLetter(profile: SpeedProfile): string {
  return PROFILE_LETTERS[profile];
}

/** `CROSSWALK:NORTH` -> `N`. */
export function crosswalkKey(crosswalkId: string): string {
  const name = crosswalkId.split(":")[1] ?? crosswalkId;
  return name.charAt(0);
}

export function laneVehicleCounts(snapshot: SpatialSnapshot): Map<LaneId, number> {
  return new Map(snapshot.inbound.map((lane) => [lane.laneId, lane.vehicles.length]));
}

/**
 * Tuple helper: trailing `undefined` values are dropped, inner ones become `null`
 * so every remaining position keeps its meaning.
 */
function tuple(...values: unknown[]): unknown[] {
  let end = values.length;
  while (end > 0 && values[end - 1] === undefined) {
    end -= 1;
  }
  return values.slice(0, end).map((value) => (value === undefined ? null : value));
}

export function compactObservationForModel(
  observation: CompactObservation,
  endTick?: number,
  spatial?: ModelSpatialContext,
): Record<string, unknown> {
  const inboundDistance = new Map<string, number>();
  for (const lane of spatial?.snapshot.inbound ?? []) {
    for (const vehicle of lane.vehicles) {
      inboundDistance.set(vehicle.vehicleId, vehicle.headIndex);
    }
  }
  return {
    currentTick: observation.currentTick,
    ...(endTick === undefined
      ? {}
      : {
          endTick,
          ticksRemaining: Math.max(0, endTick - observation.currentTick),
        }),
    financialBalance: observation.financialBalance,
    ...(observation.interruptReason === undefined
      ? {}
      : { interruptReason: compactInterruptReason(observation.interruptReason) }),
    workingMemoryTop: observation.workingMemoryTop,
    ...nonEmptyRecord("lanes", compactLanes(observation, spatial)),
    ...nonEmptyRecord("exits", compactExits(spatial)),
    ...nonEmpty(
      "stoplineCandidates",
      observation.stoplineCandidates.map((candidate) =>
        tuple(
          candidate.vehicleId,
          vehicleLetter(candidate.type),
          passengersFor(candidate.type),
          candidate.waitingTicks,
          candidate.routeId,
          candidate.intentRouteId,
        ),
      ),
    ),
    ...compactBlockedRoutes(observation),
    ...nonEmptyRecord("candidateConflicts", compactConflicts(observation)),
    ...nonEmptyRecord(
      "dischargingLanes",
      Object.fromEntries(
        (observation.dischargingLanes ?? []).map((lane) => [
          lane.laneId,
          [lane.remainingVehicles, lane.nextEnterTick, lane.estimatedClearTick],
        ]),
      ),
    ),
    ...nonEmpty(
      "revokedAdmissions",
      (observation.revokedAdmissions ?? []).map((revocation) => [
        revocation.tick,
        revocation.laneId,
        revocation.reason,
        revocation.vehicleIds,
      ]),
    ),
    ...nonEmpty(
      "activeVehicleMotions",
      (observation.activeVehicleMotions ?? []).map((motion) =>
        tuple(
          motion.vehicleId,
          motion.routeId,
          MOTION_STATE_CODES[motion.state],
          speedProfileLetter(motion.speedProfile),
          motion.scheduledEnterTick,
        ),
      ),
    ),
    ...nonEmpty(
      "emergencyAlerts",
      observation.emergencyAlerts.map((alert) => [
        alert.vehicleId,
        alert.laneId,
        alert.queueIndex,
        alert.distanceToStopline,
        alert.stationaryTicks,
        alert.blockingVehicleIds,
      ]),
    ),
    ...nonEmpty(
      "emergencyNotices",
      observation.emergencyNotices.map((notice) => [
        notice.vehicleId,
        notice.laneId,
        notice.distanceToStopline,
        notice.kind,
        notice.surchargeActive ? 1 : 0,
      ]),
    ),
    ...nonEmpty(
      "stalledVehicles",
      observation.stalledVehicles.map((stalled) =>
        compactStalled(stalled, inboundDistance.get(stalled.vehicleId)),
      ),
    ),
    ...nonEmpty(
      "activeLaneHolds",
      observation.activeLaneHolds.map((hold) => [
        hold.laneId,
        hold.routeId,
        hold.incidentId,
        hold.sinceTick,
      ]),
    ),
    ...nonEmptyRecord("exitHolds", holdRecord(observation.exitHolds)),
    ...nonEmptyRecord("crosswalkHolds", holdRecord(observation.crosswalkHolds)),
    ...nonEmptyRecord("crosswalks", compactCrosswalks(observation, spatial)),
    ...nonEmpty(
      "pedestrianAlerts",
      (observation.pedestrianAlerts ?? []).map((alert) => [
        alert.pedestrianId,
        alert.direction === "A_TO_B" ? "AB" : "BA",
        alert.kind === "JAYWALKING" ? "J" : "P",
        alert.patienceRemaining,
      ]),
    ),
    ...nonEmpty(
      "driverAlerts",
      (observation.driverAlerts ?? []).map((alert) => [
        alert.vehicleId,
        alert.laneId,
        alert.distanceToStopline,
        TEMPERAMENT_LETTERS[alert.temperament],
        alert.patienceRemaining,
      ]),
    ),
    ...nonEmpty(
      "laneGuidanceOpportunities",
      (observation.laneGuidanceOpportunities ?? []).map((opportunity) => [
        opportunity.sourceLaneId,
        opportunity.targetLaneId,
        opportunity.eligibleVehicleIds,
      ]),
    ),
    ...nonEmpty(
      "activeLaneGuidancePermits",
      (observation.activeLaneGuidancePermits ?? []).map((permit) => [
        permit.vehicleId,
        permit.sourceLaneId,
        permit.targetLaneId,
        permit.guidedRouteId,
        permit.intentRouteId,
      ]),
    ),
  };
}

/** Accident interrupts list every locked resource; the model only needs the count. */
export function compactInterruptReason(reason: string): string {
  return reason.replace(/locked=([^\s;]*)/g, (_match, list: string) =>
    `locked=${list.length === 0 ? 0 : list.split(",").length}`,
  );
}

function compactLanes(
  observation: CompactObservation,
  spatial: ModelSpatialContext | undefined,
): Record<string, unknown[]> {
  const pressure = new Map(
    observation.lanePressureSignals.map((signal) => [signal.laneId, signal]),
  );
  const upstream = new Map(
    observation.upstreamQueues.map((queue) => [queue.laneId, queue.waiting]),
  );
  const lanes: Record<string, unknown[]> = {};
  if (spatial === undefined) {
    for (const signal of observation.lanePressureSignals) {
      lanes[signal.laneId] = [
        null,
        signal.queuedPassengers ?? signal.queuedVehicles,
        upstream.get(signal.laneId) ?? 0,
      ];
    }
    return lanes;
  }
  for (const lane of spatial.snapshot.inbound) {
    const waiting = upstream.get(lane.laneId) ?? 0;
    if (lane.vehicles.length === 0 && waiting === 0) {
      continue;
    }
    const queued = lane.vehicles.filter((vehicle) => !vehicle.scheduled);
    const passengers =
      pressure.get(lane.laneId)?.queuedPassengers ??
      queued.reduce((sum, vehicle) => sum + passengersFor(vehicle.type), 0);
    const previous = spatial.previousLaneCounts?.get(lane.laneId);
    lanes[lane.laneId] = tuple(
      encodeLane(lane, 1),
      passengers,
      waiting,
      lane.vehicles.length - queued.length,
      previous === undefined ? undefined : lane.vehicles.length - previous,
    );
  }
  return lanes;
}

function compactExits(spatial: ModelSpatialContext | undefined): Record<string, string> {
  const exits: Record<string, string> = {};
  for (const lane of spatial?.snapshot.outbound ?? []) {
    if (lane.vehicles.length > 0) {
      exits[lane.laneId] = encodeLane(lane, -1);
    }
  }
  return exits;
}

function compactBlockedRoutes(observation: CompactObservation): Record<string, unknown> {
  const reservedUntil: Record<string, number> = {};
  const incidentBlocked: Record<string, Record<string, string[]>> = {};
  for (const route of observation.blockedRoutes) {
    if (route.blockKind !== "INCIDENT") {
      reservedUntil[route.routeId] = route.blockedUntilTick;
      continue;
    }
    const key = (route.incidentIds ?? []).join("+");
    const byTick = (incidentBlocked[key] ??= {});
    (byTick[String(route.blockedUntilTick)] ??= []).push(route.routeId);
  }
  return {
    ...nonEmptyRecord("reservedUntil", reservedUntil),
    ...nonEmptyRecord("incidentBlocked", incidentBlocked),
  };
}

function compactConflicts(observation: CompactObservation): Record<string, string[]> {
  const adjacency: Record<string, string[]> = {};
  for (const conflict of observation.candidateConflicts) {
    (adjacency[conflict.vehicleIdA] ??= []).push(conflict.vehicleIdB);
  }
  return adjacency;
}

function compactStalled(stalled: StalledVehicleView, distance: number | undefined): unknown[] {
  return tuple(
    stalled.vehicleId,
    stalled.laneId,
    stalled.routeId,
    distance,
    stalled.blockedBehindCount,
    stalled.bypassAvailability.map((bypass) =>
      tuple(
        bypass.routeId,
        bypass.maxMovableVehicles,
        bypass.blockingVehicleId,
        bypass.blockedSlot,
        bypass.unsupportedVehicleId,
      ),
    ),
    stalled.towTask === undefined
      ? undefined
      : [stalled.towTask.completionTick, stalled.towTask.remainingTicks],
  );
}

function holdRecord(
  holds: CompactObservation["exitHolds"],
): Record<string, [number, number]> {
  return Object.fromEntries(
    holds.map((hold) => [hold.laneId, [hold.occupied ? 1 : 0, hold.blockedUntilTick]]),
  );
}

function crosswalkSide(summary: CrosswalkDirectionSummary | undefined): unknown[] {
  if (summary === undefined) {
    return [0, 0, 0, null, null];
  }
  return [
    summary.approaching,
    summary.waiting,
    summary.externalBacklog ?? 0,
    summary.minPatienceRemaining,
    summary.clearTick,
  ];
}

function compactCrosswalks(
  observation: CompactObservation,
  spatial: ModelSpatialContext | undefined,
): Record<string, unknown[]> {
  const views = new Map(
    (spatial?.snapshot.crosswalks ?? []).map((view) => [view.crosswalkId, view]),
  );
  return Object.fromEntries(
    (observation.crosswalks ?? []).map((crosswalk) => {
      const byDirection = new Map(
        crosswalk.directions.map((direction) => [direction.direction, direction]),
      );
      const view = views.get(crosswalk.crosswalkId);
      return [
        crosswalkKey(crosswalk.crosswalkId),
        tuple(
          crosswalkSide(byDirection.get("A_TO_B")),
          view === undefined ? null : encodeCrosswalk(view),
          crosswalkSide(byDirection.get("B_TO_A")),
          view?.vehicleReservedUntil,
        ),
      ];
    }),
  );
}

function nonEmpty<T>(
  key: string,
  values: readonly T[],
): Record<string, readonly T[]> {
  return values.length === 0 ? {} : { [key]: values };
}

function nonEmptyRecord<T>(
  key: string,
  record: Record<string, T>,
): Record<string, Record<string, T>> {
  return Object.keys(record).length === 0 ? {} : { [key]: record };
}
