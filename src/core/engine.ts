import {
  cloneReservationTable,
  dryRunAdmissions as simulateAdmissions,
  findCandidateConflicts,
  findPedestrianReservationConflict,
  findReservationConflict,
  paintOccupations,
  pruneReservationTable,
  RESERVATION_PROBE_HORIZON,
  resourcesCoveredByVehicle,
  routeBlockedUntilTick,
  trajectoryUsesResources,
  transactAdmissions,
  vehicleOccupationTimeline,
  writePedestrianReservation,
  writeVehicleReservation,
  writeVehicleReservationWhereFree,
  type ScheduledCollision,
} from "./safety.js";
import {
  createPedestrian,
  normalPedestrianTimeline,
  pedestrianArrivalsAt,
  pedestrianPath,
  PEDESTRIAN_PHASE_BATCH_CAP,
  PEDESTRIAN_SUBSLOTS_PER_CELL,
  PEDESTRIAN_TICKS_PER_CELL,
  PEDESTRIAN_WAITING_AREA_CAPACITY,
  PEDESTRIAN_WARNING_REMAINING_TICKS,
  type ScheduledPedestrianArrival,
} from "./pedestrians.js";
import {
  CUT_IN_MIN_QUEUE_ADVANTAGE,
  DRIVER_ALERT_LIMIT,
  DRIVER_WARNING_REMAINING_TICKS,
  EXEMPT_DRIVER_PATIENCE,
  ROGUE_CONFLICT_PASSES,
  ROGUE_GAP_CHECK_SLOTS,
  TAILGATE_FOLLOWER_LIMIT,
  TAILGATE_MAX_GAP_SLOTS,
  driverPatienceExhausted,
  driverPatienceLimit,
  driverPatienceRemaining,
  violationForfeitsToll,
} from "./drivers.js";
import {
  DEFAULT_DYNAMICS,
  EMERGENCY_ALERT_HORIZON_SLOTS,
  adjacentRouteIds,
  holdBlocksTick,
  visibleHolds,
  willStall,
  type EngineDynamics,
} from "./dynamics.js";
import { arrivalsAt, type ScheduledArrival } from "./demand.js";
import { defaultRouteIds } from "./network.js";
import {
  commitVehicleMotion,
  normalizeSpeedProfile,
  previewVehicleMotion,
  rollingEntryMotionState,
  sweptHeadSlots,
} from "./motion.js";
import {
  nearestCollisionVehicle,
  solveCollisionOutcome,
} from "./collisionKinematics.js";
import type {
  ActiveLaneHoldView,
  AdmissionBatchResult,
  AdmissionRejectionReason,
  AdmissionResult,
  AdmissionRevocation,
  AdmissionRevocationReason,
  CompactObservation,
  ConflictResourceId,
  CrosswalkCell,
  CrosswalkCellMark,
  CrosswalkCellView,
  CrosswalkSlotView,
  CrosswalkZone,
  CollisionOutcome,
  JunctionCellVehicle,
  JunctionSnapshot,
  JunctionVehicleView,
  LaneSlotVehicle,
  LaneSlotView,
  Point,
  SpatialSnapshot,
  IncidentLogEntry,
  IncidentSummary,
  Lane,
  LaneId,
  LaneGuidancePermit,
  LaneBatchRequest,
  LanePressureSignal,
  LaneQueueInspection,
  JaywalkerExposure,
  LaneTransferRecord,
  Pedestrian,
  PedestrianAlert,
  PedestrianCohortPreview,
  PedestrianDirection,
  PedestrianId,
  PedestrianEconomyRates,
  PedestrianEvent,
  PedestrianPhaseRequest,
  PedestrianSettlement,
  ReservationTable,
  RoadNetwork,
  RouteId,
  ScheduleConflict,
  TickNumber,
  Trajectory,
  Vehicle,
  VehicleDespawnEvent,
  VehicleId,
  VehicleSpeedProfileRequest,
  VehicleType,
  DriverAlert,
  TailgateRisk,
  PlannedAdmissionEntry,
  WorkingMemoryTop,
  WorldSnapshot,
  DryRunAdmissionResult,
  EmergencyNotice,
  EmergencyNoticeKind,
} from "./types.js";
import {
  passengersFor,
  resolveVehicleOccupancy,
  riskTagFor,
  temperamentFor,
  vehicleClass,
} from "./vehicleRoster.js";

export interface EngineOptions {
  readonly network: RoadNetwork;
  readonly seed?: number;
  readonly dynamics?: Partial<EngineDynamics>;
}

export interface WaitingCharges {
  readonly delay: number;
  readonly emergency: number;
  readonly stallChain: number;
  readonly upstream: number;
}

export interface AggressionCounts {
  redLight: number;
  tailgate: number;
  cutIn: number;
}

export interface TerminalSettlement {
  readonly outboundToll: number;
  readonly crossingToll: number;
  readonly unservedOnMap: number;
  readonly unservedUpstream: number;
  readonly unservedPassengers: number;
  readonly unservedLiability: number;
}

export interface VehicleWaitingCharge {
  readonly vehicleId: VehicleId;
  readonly amount: number;
}

export interface WaitingSettlement {
  readonly totals: WaitingCharges;
  readonly vehicles: readonly VehicleWaitingCharge[];
}

export const DELAY_CHARGE_HORIZON_SLOTS = 24;

/** Revoked admissions stay visible for one maximum sleep window. */
export const ADMISSION_REVOCATION_WINDOW_TICKS = 10;

export interface ConvoyResult {
  readonly ok: boolean;
  readonly error?: string;
  readonly detail?: string;
  readonly admittedVehicleIds?: readonly VehicleId[];
  readonly conflictingVehicleId?: VehicleId;
  readonly conflictingResourceId?: string;
  readonly targetLaneId?: LaneId;
  readonly validTargetRouteIds?: readonly RouteId[];
  readonly blockingVehicleId?: VehicleId;
  readonly blockedSlot?: number;
}

export interface StallRerouteResult {
  readonly ok: boolean;
  readonly error?: string;
  readonly detail?: string;
  readonly movedVehicleIds?: readonly VehicleId[];
}

export interface LaneGuidanceResult {
  readonly ok: boolean;
  readonly error?: string;
  readonly detail?: string;
  readonly vehicleId?: VehicleId;
  readonly sourceLaneId?: LaneId;
  readonly targetLaneId?: LaneId;
  readonly intentRouteId?: RouteId;
  readonly guidedRouteId?: RouteId;
  readonly distanceToStopline?: number;
  readonly validTargetLaneIds?: readonly LaneId[];
  readonly blockingVehicleId?: VehicleId;
  readonly blockedSlot?: number;
}

export interface TowDispatchResult {
  readonly ok: boolean;
  readonly error?: string;
  readonly vehicleId?: VehicleId;
  readonly completionTick?: TickNumber;
  readonly cost?: number;
}

export interface TowTask {
  readonly vehicleId: VehicleId;
  readonly completionTick: TickNumber;
  readonly cost: number;
}

export interface DeferredArrivalQueue {
  readonly arrivals: ScheduledArrival[];
  nextIndex: number;
}

export interface StepResult {
  readonly tick: number;
  readonly despawnEvents: readonly VehicleDespawnEvent[];
  readonly enteredVehicleIds: readonly VehicleId[];
  readonly interruptReason?: string;
}

export interface PedestrianGrantResult {
  readonly ok: boolean;
  readonly cohortId?: string;
  readonly pedestrianIds?: readonly PedestrianId[];
  readonly error?: "UNKNOWN_CROSSWALK" | "INVALID_DIRECTIONS" | "RESOURCE_CONFLICT";
  readonly conflictingActorId?: string;
  readonly conflictingTick?: TickNumber;
  readonly conflictingResourceId?: ConflictResourceId;
}

export interface ScheduleDryRunResult {
  readonly feasible: boolean;
  readonly admission: DryRunAdmissionResult;
  readonly pedestrianCohorts: readonly PedestrianCohortPreview[];
  readonly conflict?: ScheduleConflict;
  readonly error?: string;
}

export interface ScheduleCommitResult {
  readonly committed: boolean;
  readonly admission: AdmissionBatchResult;
  readonly pedestrianCohorts: readonly PedestrianCohortPreview[];
  readonly conflict?: ScheduleConflict;
  readonly error?: string;
}

interface ScheduleStateSnapshot {
  readonly reservations: ReservationTable;
  readonly pendingCollisions: readonly ScheduledCollision[];
  readonly vehicles: ReadonlyMap<VehicleId, Readonly<Vehicle>>;
  readonly pedestrians: ReadonlyMap<PedestrianId, Readonly<Pedestrian>>;
  readonly nextScheduledAdmissionOrder: number;
  readonly nextPedestrianCohortSequence: number;
  readonly secondaryAdmitCount: number;
  readonly incidentLog: readonly IncidentLogEntry[];
  readonly pedestrianEvents: readonly PedestrianEvent[];
  readonly laneGuidancePermits: ReadonlyMap<VehicleId, LaneGuidancePermit>;
  readonly externalPedestrianBacklog: readonly ScheduledPedestrianArrival[];
}

interface PedestrianMoveIntent {
  readonly pedestrianId: PedestrianId;
  readonly fromCellResourceId?: ConflictResourceId;
  readonly targetCellResourceId?: ConflictResourceId;
  readonly targetRow?: 0 | 1;
  readonly targetColumn?: number;
  readonly clears: boolean;
  readonly startsJaywalking: boolean;
}

interface VehicleMoveIntent {
  readonly vehicleId: VehicleId;
  readonly routeId: RouteId;
  readonly moving: boolean;
  readonly fromHeadSlot: number;
  readonly toHeadSlot: number;
  readonly resourceIds: ReadonlySet<ConflictResourceId>;
}

export interface IncidentActionResult {
  readonly ok: boolean;
  readonly error?: string;
  readonly detail?: string;
  readonly vehicleId?: VehicleId;
  readonly routeId?: RouteId;
  readonly targetLaneId?: LaneId;
  readonly validTargetRouteIds?: readonly RouteId[];
  readonly blockingVehicleId?: VehicleId;
  readonly blockedSlot?: number;
  readonly suggestedEvacLanes?: readonly LaneId[];
  readonly incidentId?: string;
  readonly laneId?: LaneId;
  readonly holdState?: "HELD" | "RELEASED";
  readonly startedVehicleIds?: readonly VehicleId[];
  readonly noOp?: boolean;
  readonly currentTargetEvacLane?: LaneId;
  readonly targetChanged?: boolean;
}

export interface ActiveLaneHold {
  readonly laneId: LaneId;
  readonly routeId: RouteId;
  readonly incidentId: string;
  readonly sinceTick: TickNumber;
}

export interface TrackedIncident {
  id: string;
  triggerTick: TickNumber;
  status: "OPEN" | "CLOSED";
  collisionType: IncidentSummary["collisionType"];
  severity: IncidentSummary["severity"];
  vehicleIds: VehicleId[];
  pedestrianIds: PedestrianId[];
  lockedResourceIds: ConflictResourceId[];
  clearanceReadyTick?: TickNumber;
  evacuationStepTicks: number;
  collisionOutcomes: CollisionOutcome[];
  targetEvacLane?: LaneId;
  clearanceLatencyTicks?: number;
}

interface InboundTransferFailure {
  readonly ok: false;
  readonly error:
    | "TARGET_NOT_ADJACENT"
    | "TARGET_SEVERED"
    | "TARGET_LANE_SLOT_OCCUPIED"
    | "MANEUVER_NOT_SUPPORTED";
  readonly detail: string;
  readonly validTargetRouteIds: readonly RouteId[];
  readonly blockingVehicleId?: VehicleId;
  readonly blockedSlot?: number;
  readonly unsupportedVehicleId?: VehicleId;
}

interface InboundTransferStep {
  readonly vehicle: Vehicle;
  readonly trajectory: Trajectory;
}

interface InboundTransferValidation {
  readonly ok: true;
  readonly plan: readonly InboundTransferStep[];
}

interface SavedInboundVehicleState {
  readonly vehicle: Vehicle;
  readonly routeId: RouteId;
  readonly inboundLaneId: LaneId;
  readonly outboundLaneId: LaneId;
  readonly state: Vehicle["state"];
  readonly startupLagRemaining: number;
  readonly stallBlockedTicks: number;
  readonly stationaryTicks: number;
  readonly encroaching: boolean;
  readonly scheduledEnterTick?: TickNumber;
  readonly admissionState?: Vehicle["admissionState"];
  readonly scheduledAdmissionOrder?: number;
  readonly scheduledBatchId?: string;
  readonly scheduledSlideTicks?: number;
}

export interface EngineCheckpoint {
  readonly version: 1;
  readonly nextVehicleSequence: number;
  readonly nextPedestrianCohortSequence: number;
  readonly nextIncidentSequence: number;
  readonly currentTick: number;
  readonly demandTick: number;
  readonly demandSlot: number;
  readonly vehicles: readonly Vehicle[];
  readonly pedestrians: readonly Pedestrian[];
  readonly reservationTable: readonly {
    readonly tick: number;
    readonly resources: readonly {
      readonly resourceId: string;
      readonly actorId: string;
    }[];
  }[];
  readonly pendingCollisions: readonly ScheduledCollision[];
  readonly activatedCollisionKeys: readonly string[];
  readonly incidents: readonly TrackedIncident[];
  readonly lockedResources: readonly string[];
  readonly exitBlockedResources: readonly string[];
  readonly heldInboundLanes: readonly ActiveLaneHold[];
  readonly upstreamQueues: readonly {
    readonly laneId: LaneId;
    readonly nextIndex: number;
    readonly arrivals: readonly ScheduledArrival[];
  }[];
  readonly processedScheduledArrivals: readonly string[];
  readonly processedPedestrianArrivals: readonly string[];
  readonly externalPedestrianBacklog: readonly ScheduledPedestrianArrival[];
  readonly announcedCriticalPedestrians: readonly string[];
  readonly announcedJaywalkPedestrians: readonly string[];
  readonly announcedEmergencyEdges: readonly string[];
  readonly towTasks: readonly TowTask[];
  readonly laneGuidancePermits: readonly LaneGuidancePermit[];
  readonly incidentLog: readonly IncidentLogEntry[];
  readonly pedestrianEvents: readonly PedestrianEvent[];
  readonly pendingPedestrianCompletions: readonly string[];
  readonly pendingJaywalkWaves: readonly string[];
  readonly pendingFirstJaywalks: readonly string[];
  readonly pendingPedestrianCollisions: readonly string[];
  readonly lastPedestrianDelaySettlementTick: number;
  readonly pedestrianPatienceFrozen: boolean;
  readonly secondaryAdmitCount: number;
  readonly pendingTowCharges: number;
  readonly pendingSchoolBusAccidents?: number;
  readonly aggressionCounts?: AggressionCounts;
  readonly pendingTailgateLeaders?: readonly VehicleId[];
  readonly nextScheduledAdmissionOrder: number;
  readonly admissionRevocations?: readonly AdmissionRevocation[];
}

export class SimulationEngine {
  readonly network: RoadNetwork;
  readonly seed: number;
  readonly dynamics: EngineDynamics;
  readonly vehicles = new Map<VehicleId, Vehicle>();
  readonly pedestrians = new Map<PedestrianId, Pedestrian>();

  private reservationTable: ReservationTable = new Map();
  private nextVehicleSequence = 1;
  private nextPedestrianCohortSequence = 1;
  private nextIncidentSequence = 1;
  private _currentTick = 0;
  private demandTick = -1;
  private demandSlot = 0;
  private pendingCollisions: ScheduledCollision[] = [];
  private readonly activatedCollisionKeys = new Set<string>();
  private readonly incidents: TrackedIncident[] = [];
  private readonly lockedResources = new Set<string>();
  private readonly exitBlockedResources = new Set<string>();
  private readonly heldInboundLanes = new Map<LaneId, ActiveLaneHold>();
  private readonly upstreamQueues = new Map<LaneId, DeferredArrivalQueue>();
  private readonly processedScheduledArrivals = new Set<string>();
  private readonly processedPedestrianArrivals = new Set<string>();
  private externalPedestrianBacklog: ScheduledPedestrianArrival[] = [];
  private readonly announcedCriticalPedestrians = new Set<PedestrianId>();
  private readonly announcedJaywalkPedestrians = new Set<PedestrianId>();
  private readonly announcedEmergencyEdges = new Set<string>();
  private readonly towTasks = new Map<VehicleId, TowTask>();
  private readonly laneGuidancePermits = new Map<VehicleId, LaneGuidancePermit>();
  private admissionRevocations: AdmissionRevocation[] = [];
  private readonly routeCrosswalkCache = new Map<RouteId, readonly ConflictResourceId[]>();
  private crosswalkCellCache:
    | ReadonlyMap<ConflictResourceId, { crosswalkId: ConflictResourceId }>
    | undefined;
  private incidentLog: IncidentLogEntry[] = [];
  private pedestrianEvents: PedestrianEvent[] = [];
  private readonly pendingPedestrianCompletions = new Set<PedestrianId>();
  private readonly pendingJaywalkWaves = new Set<string>();
  private readonly pendingFirstJaywalks = new Set<PedestrianId>();
  private readonly pendingPedestrianCollisions = new Set<PedestrianId>();
  private lastPedestrianDelaySettlementTick = -1;
  private pedestrianPatienceFrozen = false;
  private secondaryAdmitCount = 0;
  private pendingTowCharges = 0;
  private pendingSchoolBusAccidents = 0;
  private aggressionCounts: AggressionCounts = { redLight: 0, tailgate: 0, cutIn: 0 };
  private readonly pendingTailgateLeaders = new Set<VehicleId>();
  private nextScheduledAdmissionOrder = 1;

  constructor(options: EngineOptions) {
    if (options.seed !== undefined && !Number.isInteger(options.seed)) {
      throw new Error(`Simulation seed must be an integer: ${options.seed}`);
    }
    this.network = options.network;
    this.seed = options.seed ?? 1;
    this.dynamics = { ...DEFAULT_DYNAMICS, ...options.dynamics };
    if (
      !Number.isInteger(this.dynamics.laneGuidanceNearSlots) ||
      !Number.isInteger(this.dynamics.laneGuidanceFarSlots) ||
      this.dynamics.laneGuidanceNearSlots < 0 ||
      this.dynamics.laneGuidanceNearSlots > this.dynamics.laneGuidanceFarSlots
    ) {
      throw new Error("Lane guidance bounds must be non-negative ordered integers.");
    }
  }

  get currentTick(): number {
    return this._currentTick;
  }

  /**
   * While frozen, waiting pedestrians stay in place and do not spend patience.
   * Warmup uses this so the crowd is present at the first decision with a full clock.
   */
  setPedestrianPatienceFrozen(frozen: boolean): void {
    this.pedestrianPatienceFrozen = frozen;
  }

  get reservations(): Readonly<ReservationTable> {
    return this.reservationTable;
  }

  spawnScheduledPedestrian(
    arrival: ScheduledPedestrianArrival,
  ): Pedestrian | undefined {
    if (!this.network.crosswalks.has(arrival.crosswalkId)) {
      throw new Error(`Unknown crosswalk: ${arrival.crosswalkId}`);
    }
    const key = `${arrival.id}|${arrival.tick}|${arrival.crosswalkId}|${arrival.direction}`;
    if (this.processedPedestrianArrivals.has(key)) {
      return undefined;
    }
    this.processedPedestrianArrivals.add(key);
    const waitingPosition = this.availableWaitingPosition(arrival);
    if (waitingPosition === undefined) {
      this.externalPedestrianBacklog.push(arrival);
      this.sortPedestrianBacklog();
      return undefined;
    }
    return this.admitPedestrianArrival(arrival, waitingPosition);
  }

  private admitPedestrianArrival(
    arrival: ScheduledPedestrianArrival,
    waitingPosition: {
      readonly cellId: string;
      readonly subslot: number;
    },
  ): Pedestrian {
    const pedestrian = createPedestrian(this.seed, arrival);
    const approachPath = [...this.network.pedestrianApproachPaths.values()].find(
      (path) =>
        path.crosswalkId === arrival.crosswalkId &&
        path.direction === arrival.direction &&
        path.targetWaitingCellId === waitingPosition.cellId,
    );
    const firstCell = approachPath?.cells[0];
    if (approachPath === undefined || firstCell === undefined) {
      throw new Error(
        `Missing pedestrian approach path for ${arrival.crosswalkId}:${arrival.direction}:${waitingPosition.cellId}`,
      );
    }
    pedestrian.approachPathId = approachPath.id;
    pedestrian.approachIndex = 0;
    pedestrian.approachCellId = firstCell.id;
    pedestrian.targetWaitingCellId = waitingPosition.cellId;
    pedestrian.targetWaitingSubslot = waitingPosition.subslot;
    pedestrian.nextMoveTick = this.currentTick + PEDESTRIAN_TICKS_PER_CELL;
    this.pedestrians.set(pedestrian.id, pedestrian);
    this.pedestrianEvents.push({
      kind: "PED_SPAWN",
      tick: this.currentTick,
      pedestrianIds: [pedestrian.id],
      crosswalkId: pedestrian.crosswalkId,
      directions: [pedestrian.direction],
    });
    return pedestrian;
  }

  private availableWaitingPosition(
    arrival: ScheduledPedestrianArrival,
  ): { readonly cellId: string; readonly subslot: number } | undefined {
    const area = this.network.crosswalks
      .get(arrival.crosswalkId)
      ?.waitingAreas.find((candidate) => candidate.direction === arrival.direction);
    if (area === undefined) {
      return undefined;
    }
    const occupied = new Set(
      [...this.pedestrians.values()]
        .filter(
          (pedestrian) =>
            (pedestrian.waitingCellId !== undefined &&
              pedestrian.waitingSubslot !== undefined) ||
            (pedestrian.targetWaitingCellId !== undefined &&
              pedestrian.targetWaitingSubslot !== undefined),
        )
        .map(
          (pedestrian) =>
            `${pedestrian.waitingCellId ?? pedestrian.targetWaitingCellId}:${
              pedestrian.waitingSubslot ?? pedestrian.targetWaitingSubslot
            }`,
        ),
    );
    const cells = [...area.cells].sort(
      (left, right) =>
        (left.kind === "WAITING_ZONE" ? 0 : 1) -
          (right.kind === "WAITING_ZONE" ? 0 : 1) ||
        left.id.localeCompare(right.id),
    );
    for (const cell of cells) {
      for (let subslot = 0; subslot < PEDESTRIAN_SUBSLOTS_PER_CELL; subslot += 1) {
        if (!occupied.has(`${cell.id}:${subslot}`)) {
          return { cellId: cell.id, subslot };
        }
      }
    }
    return undefined;
  }

  private sortPedestrianBacklog(): void {
    this.externalPedestrianBacklog.sort(
      (left, right) =>
        left.tick - right.tick ||
        left.slot - right.slot ||
        left.id.localeCompare(right.id),
    );
  }

  private fillPedestrianWaitingAreas(): void {
    this.sortPedestrianBacklog();
    let admitted = true;
    while (admitted) {
      admitted = false;
      for (let index = 0; index < this.externalPedestrianBacklog.length; index += 1) {
        const arrival = this.externalPedestrianBacklog[index];
        if (arrival === undefined) {
          continue;
        }
        const waitingPosition = this.availableWaitingPosition(arrival);
        if (waitingPosition === undefined) {
          continue;
        }
        this.externalPedestrianBacklog.splice(index, 1);
        this.admitPedestrianArrival(arrival, waitingPosition);
        admitted = true;
        break;
      }
    }
  }

  generatePedestrianDemand(): readonly Pedestrian[] {
    return pedestrianArrivalsAt(
      this.seed,
      this.currentTick,
      [...this.network.crosswalks.keys()],
    )
      .map((arrival) => this.spawnScheduledPedestrian(arrival))
      .filter((pedestrian): pedestrian is Pedestrian => pedestrian !== undefined);
  }

  jaywalkerExposures(
    vehicleIds: readonly VehicleId[],
  ): JaywalkerExposure[] {
    const jaywalkers = new Map<ConflictResourceId, PedestrianId[]>();
    for (const pedestrian of this.pedestrians.values()) {
      if (pedestrian.state !== "CROSSING_JAYWALK") {
        continue;
      }
      const ids = jaywalkers.get(pedestrian.crosswalkId) ?? [];
      ids.push(pedestrian.id);
      jaywalkers.set(pedestrian.crosswalkId, ids);
    }
    if (jaywalkers.size === 0) {
      return [];
    }
    return [...new Set(vehicleIds)].flatMap((vehicleId) => {
      const vehicle = this.vehicles.get(vehicleId);
      if (vehicle === undefined) {
        return [];
      }
      return this.routeCrosswalkIds(vehicle.routeId).flatMap((crosswalkId) => {
        const pedestrianIds = jaywalkers.get(crosswalkId);
        return pedestrianIds === undefined
          ? []
          : [{ vehicleId, crosswalkId, pedestrianIds: [...pedestrianIds].sort() }];
      });
    });
  }

  pedestriansForCrosswalk(
    crosswalkId: ConflictResourceId,
  ): readonly Readonly<Pedestrian>[] {
    if (!this.network.crosswalks.has(crosswalkId)) {
      throw new Error(`Unknown crosswalk: ${crosswalkId}`);
    }
    return [...this.pedestrians.values()]
      .filter((pedestrian) => pedestrian.crosswalkId === crosswalkId)
      .sort(
        (left, right) =>
          left.generatedAtTick - right.generatedAtTick ||
          left.id.localeCompare(right.id),
      )
      .slice(0, PEDESTRIAN_PHASE_BATCH_CAP);
  }

  inspectCrosswalk(
    crosswalkId: ConflictResourceId,
    limit = 8,
  ): readonly Readonly<Pedestrian>[] {
    const boundedLimit = Math.max(1, Math.min(16, Math.trunc(limit)));
    return this.pedestriansForCrosswalk(crosswalkId)
      .filter((pedestrian) => pedestrian.state !== "CLEARED")
      .sort(
        (left, right) =>
          pedestrianRiskRank(left) - pedestrianRiskRank(right) ||
          left.generatedAtTick - right.generatedAtTick ||
          left.id.localeCompare(right.id),
      )
      .slice(0, boundedLimit)
      .map((pedestrian) => ({ ...pedestrian }));
  }

  grantPedestrianPhase(
    crosswalkId: ConflictResourceId,
    requestedDirections: readonly PedestrianDirection[],
    allowVehicleCollision = false,
  ): PedestrianGrantResult {
    const crosswalk = this.network.crosswalks.get(crosswalkId);
    if (crosswalk === undefined) {
      return { ok: false, error: "UNKNOWN_CROSSWALK" };
    }
    const directions = [...new Set(requestedDirections)];
    if (
      directions.length < 1 ||
      directions.length > 2 ||
      directions.some(
        (direction) => direction !== "A_TO_B" && direction !== "B_TO_A",
      )
    ) {
      return { ok: false, error: "INVALID_DIRECTIONS" };
    }

    const cohort = [...this.pedestrians.values()]
      .filter(
        (pedestrian) =>
          pedestrian.crosswalkId === crosswalkId &&
          pedestrian.state === "WAITING" &&
          directions.includes(pedestrian.direction),
      )
      .sort(
        (left, right) =>
          left.generatedAtTick - right.generatedAtTick ||
          left.id.localeCompare(right.id),
      )
      .slice(0, PEDESTRIAN_PHASE_BATCH_CAP);
    const rowCounts: [number, number] = [0, 0];
    const plans: Array<{
      pedestrian: Pedestrian;
      row: 0 | 1;
      startTick: TickNumber;
      timeline: ReturnType<typeof normalPedestrianTimeline>;
    }> = [];
    for (const pedestrian of cohort) {
      const row: 0 | 1 =
        directions.length === 2
          ? pedestrian.direction === "A_TO_B"
            ? 0
            : 1
          : rowCounts[0] <= rowCounts[1]
            ? 0
            : 1;
      const startTick =
        this.currentTick + rowCounts[row] * PEDESTRIAN_TICKS_PER_CELL;
      rowCounts[row] += 1;
      plans.push({
        pedestrian,
        row,
        startTick,
        timeline: normalPedestrianTimeline(
          crosswalk,
          pedestrian.direction,
          row,
        ),
      });
    }

    const probe = cloneReservationTable(this.reservationTable);
    const collisions: ScheduledCollision[] = [];
    for (const plan of plans) {
      const lockedResource = plan.timeline
        .flatMap((step) => step.resourceIds)
        .find((resourceId) => this.lockedResources.has(resourceId));
      if (lockedResource !== undefined) {
        return {
          ok: false,
          error: "RESOURCE_CONFLICT",
          conflictingActorId: "INCIDENT",
          conflictingTick: plan.startTick,
          conflictingResourceId: lockedResource,
        };
      }
      const conflict = findPedestrianReservationConflict(
        plan.pedestrian.id,
        plan.timeline,
        plan.startTick,
        probe,
      );
      if (conflict !== undefined) {
        if (
          allowVehicleCollision &&
          this.vehicles.has(conflict.actorId)
        ) {
          collisions.push({
            tick: conflict.tick,
            resourceId: conflict.resourceId,
            vehicleIds: [conflict.actorId],
            pedestrianIds: [plan.pedestrian.id],
          });
          writePedestrianReservation(
            plan.pedestrian.id,
            plan.timeline,
            plan.startTick,
            probe,
          );
          continue;
        }
        return {
          ok: false,
          error: "RESOURCE_CONFLICT",
          conflictingActorId: conflict.actorId,
          conflictingTick: conflict.tick,
          conflictingResourceId: conflict.resourceId,
        };
      }
      writePedestrianReservation(
        plan.pedestrian.id,
        plan.timeline,
        plan.startTick,
        probe,
      );
    }

    const cohortId = `PC${String(this.nextPedestrianCohortSequence).padStart(5, "0")}`;
    this.nextPedestrianCohortSequence += 1;
    this.reservationTable = probe;
    this.pendingCollisions.push(...collisions);
    for (const plan of plans) {
      const firstCell = plan.timeline[0]?.cell;
      plan.pedestrian.state = "CROSSING_RESERVED";
      delete plan.pedestrian.waitingCellId;
      delete plan.pedestrian.waitingSubslot;
      plan.pedestrian.row = plan.row;
      plan.pedestrian.cohortId = cohortId;
      plan.pedestrian.scheduledStartTick = plan.startTick;
      plan.pedestrian.nextMoveTick =
        plan.startTick + PEDESTRIAN_TICKS_PER_CELL;
      if (plan.startTick === this.currentTick && firstCell !== undefined) {
        plan.pedestrian.column = firstCell.column;
      }
    }
    this.fillPedestrianWaitingAreas();
    if (plans.length > 0) {
      this.pedestrianEvents.push({
        kind: "PED_GRANT",
        tick: this.currentTick,
        pedestrianIds: plans.map((plan) => plan.pedestrian.id),
        crosswalkId,
        directions,
        cohortId,
      });
    }
    return {
      ok: true,
      cohortId,
      pedestrianIds: plans.map((plan) => plan.pedestrian.id),
    };
  }

  spawnVehicle(routeId: RouteId, type: VehicleType): Vehicle | undefined {
    return this.createVehicle(routeId, type, this.currentTick);
  }

  private createVehicle(
    routeId: RouteId,
    type: VehicleType,
    generatedAtTick: TickNumber,
  ): Vehicle | undefined {
    const trajectory = this.network.trajectories.get(routeId);
    if (trajectory === undefined) {
      throw new Error(`Unknown route: ${routeId}`);
    }

    const resolved = resolveVehicleOccupancy(type);
    const lengthSlots = resolved.lengthSlots;
    if (!this.hasSpawnCapacity(trajectory.inboundLaneId, lengthSlots)) {
      return undefined;
    }

    const id = `V${String(this.nextVehicleSequence).padStart(5, "0")}`;
    this.nextVehicleSequence += 1;
    const vehicle: Vehicle = {
      id,
      type: resolved.type,
      lengthSlots,
      intentRouteId: routeId,
      inboundLaneId: trajectory.inboundLaneId,
      outboundLaneId: trajectory.outboundLaneId,
      routeId,
      state: "GENERATED",
      inboundHeadSlot: lengthSlots - 1,
      trajectoryHeadSlot: -1,
      outboundHeadSlot: -1,
      waitingTicks: 0,
      stationaryTicks: 0,
      generatedAtTick,
      startupLagRemaining: 0,
      slowMovesDone: 0,
      slowPhase: 0,
      speedProfile: "CRUISE",
      motionCreditHalfSlots: 0,
      encroaching: false,
      stallChecked: false,
      stallBlockedTicks: 0,
      driverPatienceLimit: driverPatienceLimit(
        this.seed,
        id,
        temperamentFor(resolved.type),
      ),
      driverWaitTicks: 0,
    };
    this.vehicles.set(id, vehicle);
    return vehicle;
  }

  spawnScheduled(arrival: ScheduledArrival): Vehicle | undefined {
    const key = scheduledArrivalKey(arrival);
    if (this.processedScheduledArrivals.has(key)) {
      return undefined;
    }
    this.processedScheduledArrivals.add(key);

    const trajectory = this.network.trajectories.get(arrival.routeId);
    if (trajectory === undefined) {
      throw new Error(`Unknown route: ${arrival.routeId}`);
    }
    const queue = this.upstreamQueues.get(trajectory.inboundLaneId);
    if (queue !== undefined && queue.nextIndex < queue.arrivals.length) {
      queue.arrivals.push(arrival);
      return undefined;
    }
    const vehicle = this.createVehicle(
      arrival.routeId,
      arrival.type,
      arrival.tick,
    );
    if (vehicle !== undefined) {
      return vehicle;
    }
    this.enqueueUpstream(trajectory.inboundLaneId, arrival);
    return undefined;
  }

  drainUpstreamQueues(): Vehicle[] {
    const spawned: Vehicle[] = [];
    const laneIds = [...this.upstreamQueues.keys()].sort();
    for (const laneId of laneIds) {
      const queue = this.upstreamQueues.get(laneId);
      if (queue === undefined) {
        continue;
      }
      while (queue.nextIndex < queue.arrivals.length) {
        const arrival = queue.arrivals[queue.nextIndex];
        if (arrival === undefined) {
          break;
        }
        const vehicle = this.createVehicle(
          arrival.routeId,
          arrival.type,
          arrival.tick,
        );
        if (vehicle === undefined) {
          break;
        }
        queue.nextIndex += 1;
        spawned.push(vehicle);
      }
      if (queue.nextIndex >= queue.arrivals.length) {
        this.upstreamQueues.delete(laneId);
      } else if (
        queue.nextIndex >= 128 &&
        queue.nextIndex * 2 >= queue.arrivals.length
      ) {
        queue.arrivals.splice(0, queue.nextIndex);
        queue.nextIndex = 0;
      }
    }
    return spawned;
  }

  private enqueueUpstream(
    laneId: LaneId,
    arrival: ScheduledArrival,
  ): void {
    const queue = this.upstreamQueues.get(laneId);
    if (queue === undefined) {
      this.upstreamQueues.set(laneId, {
        arrivals: [arrival],
        nextIndex: 0,
      });
      return;
    }
    queue.arrivals.push(arrival);
  }

  spawnRandomVehicle(): Vehicle | undefined {
    if (this.demandTick !== this.currentTick) {
      this.demandTick = this.currentTick;
      this.demandSlot = 0;
    }
    const arrival = arrivalsAt(
      this.seed,
      this.currentTick,
      defaultRouteIds(this.network),
    )[this.demandSlot];
    if (arrival === undefined) {
      return undefined;
    }
    this.demandSlot += 1;
    return this.spawnVehicle(arrival.routeId, arrival.type);
  }

  applyAdmissions(vehicleIds: readonly VehicleId[]): AdmissionBatchResult {
    const transaction = transactAdmissions(
      vehicleIds,
      this.currentTick,
      this.vehicles,
      this.laneHeadVehicleIds(),
      this.network,
      this.reservationTable,
      this.admissionControl("COMMIT"),
    );

    this.reservationTable = transaction.reservationTable;
    this.pendingCollisions.push(...transaction.scheduledCollisions);
    for (const vehicleId of transaction.batch.admittedVehicleIds) {
      const vehicle = this.vehicles.get(vehicleId);
      if (vehicle === undefined) {
        throw new Error(`Admitted vehicle disappeared: ${vehicleId}`);
      }
      this.enterCrossing(vehicle);
    }
    for (const result of transaction.batch.results) {
      if (result.reason !== "ROUTE_SEVERED") {
        continue;
      }
      this.secondaryAdmitCount += 1;
      const vehicle = this.vehicles.get(result.vehicleId);
      this.incidentLog.push({
        kind: "SECONDARY_REJECT",
        tick: this.currentTick,
        vehicleId: result.vehicleId,
        ...(vehicle === undefined ? {} : { routeId: vehicle.routeId }),
      });
    }

    return transaction.batch;
  }

  dryRunAdmissions(
    vehicleIds: readonly VehicleId[],
    rewardForVehicle?: (vehicle: Vehicle) => number,
  ): DryRunAdmissionResult {
    return simulateAdmissions(
      vehicleIds,
      this.currentTick,
      this.vehicles,
      this.laneHeadVehicleIds(),
      this.network,
      this.reservationTable,
      rewardForVehicle,
      this.admissionControl("DRY_RUN"),
    );
  }

  applyAdmissionPlan(
    vehicleIds: readonly VehicleId[],
    laneBatches: readonly LaneBatchRequest[],
    vehicleSpeedProfiles: readonly VehicleSpeedProfileRequest[] = [],
  ): AdmissionBatchResult {
    const preflight = this.evaluateAdmissionPlan(
      vehicleIds,
      laneBatches,
      "DRY_RUN",
      vehicleSpeedProfiles,
    ).batch;
    const structuralReasons = new Set<AdmissionRejectionReason>([
      "DUPLICATE_REQUEST",
      "UNKNOWN_VEHICLE",
      "NOT_AT_STOPLINE",
      "NOT_LANE_HEAD",
      "STALLED",
      "UNKNOWN_ROUTE",
      "LANE_ROUTE_MISMATCH",
      "MANEUVER_NOT_PERMITTED",
    ]);
    const hardReject = preflight.results.some(
      (result) =>
        result.status === "SAFETY_REJECTED" &&
        result.reason !== undefined &&
        structuralReasons.has(result.reason),
    );
    if (hardReject) {
      const results: AdmissionResult[] = preflight.results.map((result) =>
        result.status === "ADMITTED"
          ? {
              vehicleId: result.vehicleId,
              status: "SAFETY_REJECTED",
              reason: "BATCH_ABORTED",
            }
          : result,
      );
      return {
        tick: this.currentTick,
        results,
        admittedVehicleIds: [],
        rejectedVehicleIds: results.map((result) => result.vehicleId),
        ...(preflight.enterPlan === undefined
          ? {}
          : { enterPlan: preflight.enterPlan }),
      };
    }
    return this.evaluateAdmissionPlan(
      vehicleIds,
      laneBatches,
      "COMMIT",
      vehicleSpeedProfiles,
    ).batch;
  }

  dryRunAdmissionPlan(
    vehicleIds: readonly VehicleId[],
    laneBatches: readonly LaneBatchRequest[],
    rewardForVehicle?: (vehicle: Vehicle) => number,
    vehicleSpeedProfiles: readonly VehicleSpeedProfileRequest[] = [],
  ): DryRunAdmissionResult {
    const evaluated = this.evaluateAdmissionPlan(
      vehicleIds,
      laneBatches,
      "DRY_RUN",
      vehicleSpeedProfiles,
    );
    const feasible =
      evaluated.batch.rejectedVehicleIds.length === 0 &&
      evaluated.batch.admittedVehicleIds.length === evaluated.requestedCount;
    return {
      feasible,
      estimatedFlowReward: feasible
        ? evaluated.batch.admittedVehicleIds.reduce((sum, vehicleId) => {
            const vehicle = this.vehicles.get(vehicleId);
            return vehicle === undefined
              ? sum
              : sum + (rewardForVehicle?.(vehicle) ?? 0);
          }, 0)
        : 0,
      batch: evaluated.batch,
      ...(evaluated.conflictDetected === undefined
        ? {}
        : { conflictDetected: evaluated.conflictDetected }),
      ...(evaluated.batch.enterPlan === undefined
        ? {}
        : { enterPlan: evaluated.batch.enterPlan }),
    };
  }

  dryRunSchedule(
    vehicleIds: readonly VehicleId[],
    laneBatches: readonly LaneBatchRequest[],
    pedestrianPhases: readonly PedestrianPhaseRequest[],
    rewardForVehicle?: (vehicle: Vehicle) => number,
    vehicleSpeedProfiles: readonly VehicleSpeedProfileRequest[] = [],
  ): ScheduleDryRunResult {
    try {
      this.normalizeVehicleSpeedProfiles(vehicleIds, vehicleSpeedProfiles);
    } catch (error) {
      return {
        feasible: false,
        admission: {
          feasible: false,
          estimatedFlowReward: 0,
          batch: emptyAdmissionBatch(this.currentTick),
        },
        pedestrianCohorts: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
    let phases: readonly PedestrianPhaseRequest[];
    try {
      phases = this.normalizePedestrianPhases(pedestrianPhases);
    } catch (error) {
      const admission = this.scheduleVehicleDryRun(
        vehicleIds,
        laneBatches,
        rewardForVehicle,
        vehicleSpeedProfiles,
      );
      return {
        feasible: false,
        admission,
        pedestrianCohorts: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
    const admission = this.scheduleVehicleDryRun(
      vehicleIds,
      laneBatches,
      rewardForVehicle,
      vehicleSpeedProfiles,
    );
    if (!admission.feasible) {
      return {
        feasible: false,
        admission,
        pedestrianCohorts: [],
        ...(admission.conflictDetected === undefined
          ? {}
          : {
              conflict: {
                actorIds: admission.conflictDetected.conflictingVehicles,
                tick:
                  this.currentTick +
                  admission.conflictDetected.tickOffset,
                resourceId:
                  admission.conflictDetected.conflictResourceId,
              },
            }),
      };
    }

    const snapshot = this.captureScheduleState();
    const cohorts: PedestrianCohortPreview[] = [];
    try {
      this.applyScheduleVehicles(
        vehicleIds,
        laneBatches,
        vehicleSpeedProfiles,
      );
      for (const phase of phases) {
        const result = this.grantPedestrianPhase(
          phase.crosswalkId,
          phase.directions,
        );
        if (!result.ok) {
          return {
            feasible: false,
            admission,
            pedestrianCohorts: [],
            ...(result.conflictingActorId === undefined ||
            result.conflictingTick === undefined ||
            result.conflictingResourceId === undefined
              ? {}
              : {
                  conflict: {
                    actorIds: [result.conflictingActorId],
                    tick: result.conflictingTick,
                    resourceId: result.conflictingResourceId,
                  },
                }),
            ...(result.error === undefined ? {} : { error: result.error }),
          };
        }
        cohorts.push(this.cohortPreview(phase, result));
      }
      return {
        feasible: true,
        admission,
        pedestrianCohorts: cohorts,
      };
    } finally {
      this.restoreScheduleState(snapshot);
    }
  }

  commitSchedule(
    vehicleIds: readonly VehicleId[],
    laneBatches: readonly LaneBatchRequest[],
    pedestrianPhases: readonly PedestrianPhaseRequest[],
    vehicleSpeedProfiles: readonly VehicleSpeedProfileRequest[] = [],
  ): ScheduleCommitResult {
    try {
      this.normalizeVehicleSpeedProfiles(vehicleIds, vehicleSpeedProfiles);
    } catch (error) {
      return {
        committed: false,
        admission: emptyAdmissionBatch(this.currentTick),
        pedestrianCohorts: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
    let phases: readonly PedestrianPhaseRequest[];
    try {
      phases = this.normalizePedestrianPhases(pedestrianPhases);
    } catch (error) {
      return {
        committed: false,
        admission: emptyAdmissionBatch(this.currentTick),
        pedestrianCohorts: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }

    const preflight = this.scheduleVehicleDryRun(
      vehicleIds,
      laneBatches,
      undefined,
      vehicleSpeedProfiles,
    );
    const nonCollisionReject = preflight.batch.results.find(
      (result) =>
        result.status === "SAFETY_REJECTED" &&
        result.reason !== "RESOURCE_CONFLICT",
    );
    if (nonCollisionReject !== undefined) {
      for (const result of preflight.batch.results) {
        if (result.reason !== "ROUTE_SEVERED") {
          continue;
        }
        this.secondaryAdmitCount += 1;
        const vehicle = this.vehicles.get(result.vehicleId);
        this.incidentLog.push({
          kind: "SECONDARY_REJECT",
          tick: this.currentTick,
          vehicleId: result.vehicleId,
          ...(vehicle === undefined ? {} : { routeId: vehicle.routeId }),
        });
      }
      return {
        committed: false,
        admission: preflight.batch,
        pedestrianCohorts: [],
        error: nonCollisionReject.reason ?? "REJECTED",
      };
    }

    const snapshot = this.captureScheduleState();
    const admission = this.applyScheduleVehicles(
      vehicleIds,
      laneBatches,
      vehicleSpeedProfiles,
    );
    const cohorts: PedestrianCohortPreview[] = [];
    for (const phase of phases) {
      const result = this.grantPedestrianPhase(
        phase.crosswalkId,
        phase.directions,
        true,
      );
      if (!result.ok) {
        this.restoreScheduleState(snapshot);
        return {
          committed: false,
          admission: preflight.batch,
          pedestrianCohorts: [],
          ...(result.conflictingActorId === undefined ||
          result.conflictingTick === undefined ||
          result.conflictingResourceId === undefined
            ? {}
            : {
                conflict: {
                  actorIds: [result.conflictingActorId],
                  tick: result.conflictingTick,
                  resourceId: result.conflictingResourceId,
                },
              }),
          ...(result.error === undefined ? {} : { error: result.error }),
        };
      }
      cohorts.push(this.cohortPreview(phase, result));
    }
    return {
      committed: true,
      admission,
      pedestrianCohorts: cohorts,
    };
  }

  private scheduleVehicleDryRun(
    vehicleIds: readonly VehicleId[],
    laneBatches: readonly LaneBatchRequest[],
    rewardForVehicle?: (vehicle: Vehicle) => number,
    vehicleSpeedProfiles: readonly VehicleSpeedProfileRequest[] = [],
  ): DryRunAdmissionResult {
    if (laneBatches.length === 0 && vehicleSpeedProfiles.length === 0) {
      return this.dryRunAdmissions(vehicleIds, rewardForVehicle);
    }
    return this.dryRunAdmissionPlan(
      vehicleIds,
      laneBatches,
      rewardForVehicle,
      vehicleSpeedProfiles,
    );
  }

  private applyScheduleVehicles(
    vehicleIds: readonly VehicleId[],
    laneBatches: readonly LaneBatchRequest[],
    vehicleSpeedProfiles: readonly VehicleSpeedProfileRequest[] = [],
  ): AdmissionBatchResult {
    if (laneBatches.length === 0 && vehicleSpeedProfiles.length === 0) {
      return this.applyAdmissions(vehicleIds);
    }
    return this.applyAdmissionPlan(
      vehicleIds,
      laneBatches,
      vehicleSpeedProfiles,
    );
  }

  private normalizePedestrianPhases(
    phases: readonly PedestrianPhaseRequest[],
  ): readonly PedestrianPhaseRequest[] {
    const byCrosswalk = new Map<string, Set<PedestrianDirection>>();
    for (const phase of phases) {
      if (!this.network.crosswalks.has(phase.crosswalkId)) {
        throw new Error(`UNKNOWN_CROSSWALK:${phase.crosswalkId}`);
      }
      if (phase.directions.length === 0) {
        throw new Error(`EMPTY_PEDESTRIAN_DIRECTIONS:${phase.crosswalkId}`);
      }
      const directions =
        byCrosswalk.get(phase.crosswalkId) ??
        new Set<PedestrianDirection>();
      for (const direction of phase.directions) {
        if (direction !== "A_TO_B" && direction !== "B_TO_A") {
          throw new Error(`INVALID_PEDESTRIAN_DIRECTION:${direction}`);
        }
        directions.add(direction);
      }
      byCrosswalk.set(phase.crosswalkId, directions);
    }
    return [...byCrosswalk.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([crosswalkId, directions]) => ({
        crosswalkId,
        directions: (["A_TO_B", "B_TO_A"] as const).filter((direction) =>
          directions.has(direction),
        ),
      }));
  }

  private cohortPreview(
    phase: PedestrianPhaseRequest,
    result: PedestrianGrantResult,
  ): PedestrianCohortPreview {
    const pedestrianIds = result.pedestrianIds ?? [];
    const clearTick = pedestrianIds.reduce((latest, pedestrianId) => {
      const pedestrian = this.pedestrians.get(pedestrianId);
      return Math.max(
        latest,
        (pedestrian?.scheduledStartTick ?? this.currentTick) +
          8 * PEDESTRIAN_TICKS_PER_CELL,
      );
    }, this.currentTick);
    return {
      crosswalkId: phase.crosswalkId,
      directions: phase.directions,
      pedestrianIds,
      clearTick,
    };
  }

  private captureScheduleState(): ScheduleStateSnapshot {
    return {
      reservations: cloneReservationTable(this.reservationTable),
      pendingCollisions: [...this.pendingCollisions],
      vehicles: new Map(
        [...this.vehicles].map(([id, vehicle]) => [id, { ...vehicle }]),
      ),
      pedestrians: new Map(
        [...this.pedestrians].map(([id, pedestrian]) => [
          id,
          { ...pedestrian },
        ]),
      ),
      nextScheduledAdmissionOrder: this.nextScheduledAdmissionOrder,
      nextPedestrianCohortSequence: this.nextPedestrianCohortSequence,
      secondaryAdmitCount: this.secondaryAdmitCount,
      incidentLog: [...this.incidentLog],
      pedestrianEvents: [...this.pedestrianEvents],
      laneGuidancePermits: new Map(this.laneGuidancePermits),
      externalPedestrianBacklog: [...this.externalPedestrianBacklog],
    };
  }

  private restoreScheduleState(snapshot: ScheduleStateSnapshot): void {
    this.reservationTable = cloneReservationTable(snapshot.reservations);
    this.pendingCollisions = [...snapshot.pendingCollisions];
    restoreEntityMap(this.vehicles, snapshot.vehicles);
    restoreEntityMap(this.pedestrians, snapshot.pedestrians);
    this.nextScheduledAdmissionOrder = snapshot.nextScheduledAdmissionOrder;
    this.nextPedestrianCohortSequence =
      snapshot.nextPedestrianCohortSequence;
    this.secondaryAdmitCount = snapshot.secondaryAdmitCount;
    this.incidentLog = [...snapshot.incidentLog];
    this.pedestrianEvents = [...snapshot.pedestrianEvents];
    this.externalPedestrianBacklog = [...snapshot.externalPedestrianBacklog];
    this.laneGuidancePermits.clear();
    for (const [vehicleId, permit] of snapshot.laneGuidancePermits) {
      this.laneGuidancePermits.set(vehicleId, permit);
    }
  }

  private evaluateAdmissionPlan(
    vehicleIds: readonly VehicleId[],
    laneBatches: readonly LaneBatchRequest[],
    mode: "DRY_RUN" | "COMMIT",
    vehicleSpeedProfiles: readonly VehicleSpeedProfileRequest[] = [],
  ): {
    readonly batch: AdmissionBatchResult;
    readonly requestedCount: number;
    readonly conflictDetected?: DryRunAdmissionResult["conflictDetected"];
  } {
    const explicitProfiles = this.normalizeVehicleSpeedProfiles(
      vehicleIds,
      vehicleSpeedProfiles,
    );
    const planningVehicles = new Map(this.vehicles);
    for (const [vehicleId, speedProfile] of explicitProfiles) {
      const vehicle = this.vehicles.get(vehicleId);
      if (vehicle !== undefined) {
        planningVehicles.set(vehicleId, {
          ...vehicle,
          speedProfile,
          motionCreditHalfSlots: 0,
          slowMovesDone: 0,
          slowPhase: 0,
        });
      }
    }
    const batchVehicleIds = new Set(
      laneBatches.flatMap((request) =>
        this.inboundVehiclesForLane(request.laneId)
          .filter((vehicle) => vehicle.scheduledEnterTick === undefined)
          .slice(0, Math.max(0, Math.trunc(request.topN)))
          .map((vehicle) => vehicle.id),
      ),
    );
    const direct = transactAdmissions(
      vehicleIds,
      this.currentTick,
      planningVehicles,
      this.laneHeadVehicleIds(),
      this.network,
      this.reservationTable,
      this.admissionControl(mode, batchVehicleIds),
    );
    const directVehicleIds = new Set(vehicleIds);
    const entries = this.resolveLaneBatchEntries(
      laneBatches,
      direct.reservationTable,
      directVehicleIds,
    ).filter((entry) => !directVehicleIds.has(entry.vehicleId));
    const requestedSlots = vehicleIds.length + entries.length;
    if (requestedSlots > 16) {
      throw new Error(`Admission plan exceeds 16 vehicles: ${requestedSlots}`);
    }
    const table = direct.reservationTable;
    const results: AdmissionResult[] = [...direct.batch.results];
    const collisions: ScheduledCollision[] = [...direct.scheduledCollisions];
    const seen = new Set(vehicleIds);
    const directConflict = direct.batch.results.find(
      (result) =>
        result.reason === "RESOURCE_CONFLICT" &&
        result.conflictingTick !== undefined &&
        result.conflictingResourceId !== undefined &&
        result.conflictingVehicleId !== undefined,
    );
    let conflictDetected: DryRunAdmissionResult["conflictDetected"] =
      directConflict?.conflictingTick === undefined ||
      directConflict.conflictingResourceId === undefined ||
      directConflict.conflictingVehicleId === undefined
        ? undefined
        : {
            tickOffset: directConflict.conflictingTick - this.currentTick,
            conflictResourceId: directConflict.conflictingResourceId,
            conflictingVehicles: [
              directConflict.vehicleId,
              directConflict.conflictingVehicleId,
            ],
          };

    for (const entry of entries) {
      const vehicle = this.vehicles.get(entry.vehicleId);
      if (seen.has(entry.vehicleId)) {
        results.push({
          vehicleId: entry.vehicleId,
          status: "SAFETY_REJECTED",
          reason: "DUPLICATE_REQUEST",
        });
        continue;
      }
      seen.add(entry.vehicleId);
      if (vehicle === undefined) {
        results.push({
          vehicleId: entry.vehicleId,
          status: "SAFETY_REJECTED",
          reason: "UNKNOWN_VEHICLE",
        });
        continue;
      }
      const trajectory = this.network.trajectories.get(vehicle.routeId);
      if (trajectory === undefined) {
        results.push({
          vehicleId: vehicle.id,
          status: "SAFETY_REJECTED",
          reason: "UNKNOWN_ROUTE",
        });
        continue;
      }
      if (trajectory.inboundLaneId !== vehicle.inboundLaneId) {
        results.push({
          vehicleId: vehicle.id,
          status: "SAFETY_REJECTED",
          reason: "LANE_ROUTE_MISMATCH",
        });
        continue;
      }
      const plannedVehicle: Vehicle = {
        ...vehicle,
        speedProfile: entry.speedProfile,
        motionCreditHalfSlots: 0,
        slowMovesDone: 0,
        slowPhase: 0,
      };
      if (entry.rolling === true) {
        Object.assign(
          plannedVehicle,
          rollingEntryMotionState(
            plannedVehicle,
            trajectory.maneuver,
            this.dynamics.slowStartSteps,
          ),
        );
      }
      const blocked = this.probeCrossing(
        plannedVehicle,
        trajectory.slots,
        entry.enterTick,
        table,
      );
      if (blocked?.error === "RESOURCE_CONFLICT") {
        const conflict = findReservationConflict(
          plannedVehicle,
          trajectory.slots,
          entry.enterTick,
          table,
          this.dynamics.slowStartSteps,
        );
        if (conflict !== undefined) {
          conflictDetected ??= {
            tickOffset: conflict.tick - this.currentTick,
            conflictResourceId: conflict.resourceId,
            conflictingVehicles: [vehicle.id, conflict.vehicleId],
          };
          if (mode === "COMMIT") {
            const conflictingVehicle = this.vehicles.has(
              conflict.vehicleId,
            );
            collisions.push({
              tick: conflict.tick,
              resourceId: conflict.resourceId,
              vehicleIds: conflictingVehicle
                ? [vehicle.id, conflict.vehicleId].sort()
                : [vehicle.id],
              ...(conflictingVehicle
                ? {}
                : { pedestrianIds: [conflict.vehicleId] }),
            });
            results.push({ vehicleId: vehicle.id, status: "ADMITTED" });
            continue;
          }
          results.push({
            vehicleId: vehicle.id,
            status: "SAFETY_REJECTED",
            reason: "RESOURCE_CONFLICT",
            conflictingVehicleId: conflict.vehicleId,
            conflictingTick: conflict.tick,
            conflictingResourceId: conflict.resourceId,
          });
          continue;
        }
      }
      if (blocked !== undefined) {
        results.push({
          vehicleId: vehicle.id,
          status: "SAFETY_REJECTED",
          reason: blocked.error as AdmissionRejectionReason,
        });
        continue;
      }
      writeVehicleReservation(
        plannedVehicle,
        trajectory.slots,
        entry.enterTick,
        table,
        this.dynamics.slowStartSteps,
      );
      results.push({ vehicleId: vehicle.id, status: "ADMITTED" });
    }

    const admittedVehicleIds = results
      .filter((result) => result.status === "ADMITTED")
      .map((result) => result.vehicleId);
    const rejectedVehicleIds = results
      .filter((result) => result.status === "SAFETY_REJECTED")
      .map((result) => result.vehicleId);
    const batch: AdmissionBatchResult = {
      tick: this.currentTick,
      results,
      admittedVehicleIds,
      rejectedVehicleIds,
      enterPlan: entries,
    };

    if (mode === "COMMIT") {
      this.reservationTable = table;
      this.pendingCollisions.push(...collisions);
      for (const result of results) {
        if (result.reason !== "ROUTE_SEVERED") {
          continue;
        }
        this.secondaryAdmitCount += 1;
        const vehicle = this.vehicles.get(result.vehicleId);
        this.incidentLog.push({
          kind: "SECONDARY_REJECT",
          tick: this.currentTick,
          vehicleId: result.vehicleId,
          ...(vehicle === undefined ? {} : { routeId: vehicle.routeId }),
        });
      }
      const directIds = new Set(direct.batch.admittedVehicleIds);
      for (const vehicleId of directIds) {
        const vehicle = this.vehicles.get(vehicleId);
        if (vehicle !== undefined) {
          vehicle.speedProfile = explicitProfiles.get(vehicleId) ?? "CRUISE";
          vehicle.motionCreditHalfSlots = 0;
          vehicle.slowMovesDone = 0;
          vehicle.slowPhase = 0;
          this.enterCrossing(vehicle);
        }
      }
      for (const entry of entries) {
        if (!admittedVehicleIds.includes(entry.vehicleId)) {
          continue;
        }
        const vehicle = this.vehicles.get(entry.vehicleId);
        if (vehicle === undefined) {
          continue;
        }
        vehicle.speedProfile = entry.speedProfile;
        vehicle.motionCreditHalfSlots = 0;
        vehicle.slowMovesDone = 0;
        vehicle.slowPhase = 0;
        if (entry.rolling === true) {
          const trajectory = this.network.trajectories.get(vehicle.routeId);
          if (trajectory !== undefined) {
            Object.assign(
              vehicle,
              rollingEntryMotionState(
                vehicle,
                trajectory.maneuver,
                this.dynamics.slowStartSteps,
              ),
            );
          }
        }
        if (entry.enterTick <= this.currentTick) {
          this.enterCrossing(vehicle);
          continue;
        }
        vehicle.scheduledEnterTick = entry.enterTick;
        vehicle.admissionState = "SCHEDULED_ENTERING";
        vehicle.scheduledAdmissionOrder = this.nextScheduledAdmissionOrder;
        this.nextScheduledAdmissionOrder += 1;
        if (entry.batchId !== undefined) {
          vehicle.scheduledBatchId = entry.batchId;
        }
        vehicle.startupLagRemaining = 0;
      }
    }
    return {
      batch,
      requestedCount: vehicleIds.length + entries.length,
      ...(conflictDetected === undefined ? {} : { conflictDetected }),
    };
  }

  private normalizeVehicleSpeedProfiles(
    vehicleIds: readonly VehicleId[],
    requests: readonly VehicleSpeedProfileRequest[],
  ): ReadonlyMap<VehicleId, Vehicle["speedProfile"]> {
    const explicitIds = new Set(vehicleIds);
    const profiles = new Map<VehicleId, Vehicle["speedProfile"]>(
      vehicleIds.map((vehicleId) => [vehicleId, "CRUISE"]),
    );
    const seen = new Set<VehicleId>();
    for (const request of requests) {
      if (seen.has(request.vehicleId)) {
        throw new Error(`DUPLICATE_VEHICLE_SPEED_PROFILE:${request.vehicleId}`);
      }
      seen.add(request.vehicleId);
      if (!explicitIds.has(request.vehicleId)) {
        throw new Error(
          `PROFILE_VEHICLE_NOT_EXPLICIT:${request.vehicleId}`,
        );
      }
      if (!this.vehicles.has(request.vehicleId)) {
        throw new Error(`UNKNOWN_PROFILE_VEHICLE:${request.vehicleId}`);
      }
      profiles.set(request.vehicleId, request.speedProfile);
    }
    return profiles;
  }

  private resolveLaneBatchEntries(
    laneBatches: readonly LaneBatchRequest[],
    baseReservations: ReservationTable,
    additionallyExcludedCreep: ReadonlySet<VehicleId>,
  ): PlannedAdmissionEntry[] {
    const seenLanes = new Set<LaneId>();
    const entries: PlannedAdmissionEntry[] = [];
    const groups: Array<{
      readonly batchIndex: number;
      readonly request: LaneBatchRequest;
      readonly laneCapacity: number;
      readonly selected: readonly Vehicle[];
    }> = [];
    for (const [batchIndex, request] of laneBatches.entries()) {
      if (!Number.isInteger(request.topN) || request.topN < 1 || request.topN > 8) {
        throw new Error(`Invalid topN for ${request.laneId}: ${request.topN}`);
      }
      if (seenLanes.has(request.laneId)) {
        throw new Error(`Duplicate lane batch: ${request.laneId}`);
      }
      seenLanes.add(request.laneId);
      const lane = this.network.inboundLanes.get(request.laneId);
      if (lane === undefined) {
        throw new Error(`Unknown inbound lane: ${request.laneId}`);
      }
      const selected = this.inboundVehiclesForLane(request.laneId)
        .filter((vehicle) => vehicle.scheduledEnterTick === undefined)
        .slice(0, Math.max(0, Math.trunc(request.topN)));
      const front = selected[0];
      if (front === undefined) {
        continue;
      }
      if (
        front.id !== this.laneHeadVehicleIds().get(request.laneId) ||
        front.state !== "AT_STOPLINE"
      ) {
        throw new Error(`Lane head is not ready: ${request.laneId}`);
      }
      if (selected.some((vehicle) => vehicle.state === "STALLED")) {
        throw new Error(`Stalled vehicle in lane batch: ${request.laneId}`);
      }

      groups.push({
        batchIndex,
        request,
        laneCapacity: lane.capacitySlots,
        selected,
      });
    }

    const excludedCreep = new Set(additionallyExcludedCreep);
    for (const group of groups) {
      for (const vehicle of group.selected) {
        excludedCreep.add(vehicle.id);
      }
    }
    const planningTable = cloneReservationTable(baseReservations);
    paintOccupations(
      planningTable,
      this.creepOccupations(excludedCreep),
      this.currentTick,
      RESERVATION_PROBE_HORIZON,
    );

    for (const group of groups) {
      const { batchIndex, request, selected } = group;
      const speedProfile = normalizeSpeedProfile(request.speedProfile);
      const batchId = `B${this.currentTick}-${batchIndex + 1}-${request.laneId}`;
      const simulated = selected.map((vehicle) => ({
        vehicle,
        headSlot: vehicle.inboundHeadSlot,
      }));
      let readyTick = this.currentTick;
      for (let index = 0; index < simulated.length; index += 1) {
        const item = simulated[index];
        if (item === undefined) {
          continue;
        }
        const trajectory = this.network.trajectories.get(item.vehicle.routeId);
        if (trajectory === undefined) {
          throw new Error(`Unknown route: ${item.vehicle.routeId}`);
        }
        const plannedVehicle: Vehicle = {
          ...item.vehicle,
          speedProfile,
          motionCreditHalfSlots: 0,
          slowMovesDone: 0,
          slowPhase: 0,
        };
        const rolling = index > 0;
        if (rolling) {
          Object.assign(
            plannedVehicle,
            rollingEntryMotionState(
              plannedVehicle,
              trajectory.maneuver,
              this.dynamics.slowStartSteps,
            ),
          );
        }
        let enterTick = readyTick;
        let blocked = this.probeCrossing(
          plannedVehicle,
          trajectory.slots,
          enterTick,
          planningTable,
        );
        while (
          blocked?.error === "RESOURCE_CONFLICT" ||
          blocked?.error === "CROSSWALK"
        ) {
          enterTick += 1;
          if (enterTick > this.currentTick + RESERVATION_PROBE_HORIZON) {
            throw new Error(
              `Admission planning horizon exceeded for ${item.vehicle.id}`,
            );
          }
          blocked = this.probeCrossing(
            plannedVehicle,
            trajectory.slots,
            enterTick,
            planningTable,
          );
        }
        if (blocked === undefined) {
          writeVehicleReservation(
            plannedVehicle,
            trajectory.slots,
            enterTick,
            planningTable,
            this.dynamics.slowStartSteps,
          );
        }
        entries.push({
          vehicleId: item.vehicle.id,
          laneId: request.laneId,
          enterTick,
          scheduled: enterTick > this.currentTick,
          speedProfile,
          ...(rolling ? { rolling: true } : {}),
          batchId,
        });

        const next = simulated[index + 1];
        if (next !== undefined) {
          readyTick = this.advanceSimulatedLaneUntilReady(
            simulated.slice(index + 1),
            group.laneCapacity,
            enterTick,
          );
        }
      }
    }
    return entries;
  }

  private advanceSimulatedLaneUntilReady(
    vehicles: Array<{ vehicle: Vehicle; headSlot: number }>,
    capacitySlots: number,
    fromTick: number,
  ): number {
    let tick = fromTick;
    while ((vehicles[0]?.headSlot ?? capacitySlots - 1) < capacitySlots - 1) {
      tick += 1;
      let plannedFrontTail = capacitySlots;
      for (const item of vehicles) {
        const maxHead = Math.min(capacitySlots - 1, plannedFrontTail - 1);
        item.headSlot = Math.min(item.headSlot + 1, maxHead);
        plannedFrontTail = item.headSlot - item.vehicle.lengthSlots + 1;
      }
    }
    return tick;
  }

  step(): StepResult {
    const positions = new Map(
      [...this.vehicles.values()].map((vehicle) => [
        vehicle.id,
        vehiclePositionKey(vehicle),
      ]),
    );
    // A collision already due this tick must freeze those vehicles before
    // they take another step. The clock still advances so later demand ticks
    // stay aligned with the seed script.
    const alreadyDue = this.activateDueAccidents();
    const vehicleMoveIntents = this.vehicleMoveIntents();
    const pedestrianMoveIntents =
      this.planPedestrianMoves(vehicleMoveIntents);
    this.commitPedestrianMoves(pedestrianMoveIntents);
    this.advanceApproachingPedestrians();
    this.advanceDepartingPedestrians();
    const pedestrianWake = this.pedestrianWakeInterrupt(
      pedestrianMoveIntents,
    );
    this.queuePedestrianVehicleCollisions(
      pedestrianMoveIntents,
      vehicleMoveIntents,
    );
    const pedestrianAccident = this.activateDueAccidents();
    const secondaryAccident =
      this.activateSecondaryAccidents(vehicleMoveIntents);
    this.advanceInboundVehicles();
    const despawnEvents = this.advanceActiveVehicles();
    this.refreshExitLocks();
    this._currentTick += 1;
    this.completeDueTowTasks();
    pruneReservationTable(this.reservationTable, this.currentTick);
    this.refreshIncidentLocks();
    this.paintImmediatePedestrianOccupations();
    const enteredVehicleIds = this.promoteScheduledEntries();
    const aggression = this.stepAggression();
    enteredVehicleIds.push(...aggression.enteredVehicleIds);
    const justArrived = this.activateDueAccidents();
    this.updateStationaryTicks(positions);
    const interruptReason = [
      alreadyDue,
      pedestrianWake,
      pedestrianAccident,
      secondaryAccident,
      aggression.interruptReason,
      justArrived,
    ]
      .filter((reason) => reason !== undefined)
      .join("; ");
    return interruptReason.length === 0
      ? { tick: this.currentTick, despawnEvents, enteredVehicleIds }
      : {
          tick: this.currentTick,
          despawnEvents,
          enteredVehicleIds,
          interruptReason,
        };
  }

  private vehicleMoveIntents(): VehicleMoveIntent[] {
    const intents: VehicleMoveIntent[] = [];
    for (const vehicle of this.vehicles.values()) {
      if (
        vehicle.state !== "CROSSING" &&
        vehicle.state !== "EXIT_BLOCKED"
      ) {
        continue;
      }
      const trajectory = this.network.trajectories.get(vehicle.routeId);
      if (trajectory === undefined) {
        continue;
      }
      const motion = previewVehicleMotion(
        vehicle,
        trajectory.maneuver,
        this.dynamics.slowStartSteps,
      );
      const displacement = this.allowedTrajectoryDisplacement(
        vehicle,
        motion.displacement,
      );
      const poses = sweptHeadSlots(vehicle.trajectoryHeadSlot, displacement);
      const resourceIds = new Set<ConflictResourceId>();
      for (const headSlot of poses) {
        const pose = { ...vehicle, trajectoryHeadSlot: headSlot };
        for (const resourceId of resourcesCoveredByVehicle(
          pose,
          trajectory.slots,
        )) {
          resourceIds.add(resourceId);
        }
      }
      intents.push({
        vehicleId: vehicle.id,
        routeId: vehicle.routeId,
        moving: displacement > 0,
        fromHeadSlot: vehicle.trajectoryHeadSlot,
        toHeadSlot: vehicle.trajectoryHeadSlot + displacement,
        resourceIds,
      });
    }
    return intents;
  }

  private planPedestrianMoves(
    vehicleIntents: readonly VehicleMoveIntent[],
  ): PedestrianMoveIntent[] {
    const desired: PedestrianMoveIntent[] = [];
    const pedestrians = [...this.pedestrians.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    for (const pedestrian of pedestrians) {
      if (pedestrian.state === "WAITING") {
        if (this.pedestrianPatienceFrozen) {
          continue;
        }
        pedestrian.waitingTicks += 1;
        if (pedestrian.waitingTicks < pedestrian.patienceLimit) {
          continue;
        }
        const crosswalk = this.network.crosswalks.get(pedestrian.crosswalkId);
        if (crosswalk === undefined) {
          continue;
        }
        const row = this.availableJaywalkRow(pedestrian, crosswalk);
        if (row === undefined) {
          continue;
        }
        const target = pedestrianPath(
          crosswalk,
          pedestrian.direction,
          row,
        )[0];
        if (
          target === undefined ||
          !this.jaywalkTargetIsSafe(target, vehicleIntents)
        ) {
          continue;
        }
        desired.push({
          pedestrianId: pedestrian.id,
          targetCellResourceId: target.conflictResourceId,
          targetRow: row,
          targetColumn: target.column,
          clears: false,
          startsJaywalking: true,
        });
        continue;
      }
      if (
        pedestrian.state !== "CROSSING_RESERVED" &&
        pedestrian.state !== "CROSSING_JAYWALK"
      ) {
        continue;
      }
      const dueTick =
        pedestrian.column === undefined
          ? pedestrian.scheduledStartTick
          : pedestrian.nextMoveTick;
      if (dueTick === undefined || this.currentTick + 1 < dueTick) {
        continue;
      }
      const crosswalk = this.network.crosswalks.get(pedestrian.crosswalkId);
      const row = pedestrian.row;
      if (crosswalk === undefined || row === undefined) {
        continue;
      }
      const path = pedestrianPath(crosswalk, pedestrian.direction, row);
      const currentIndex =
        pedestrian.column === undefined
          ? -1
          : path.findIndex((cell) => cell.column === pedestrian.column);
      const currentCell =
        currentIndex < 0 ? undefined : path[currentIndex];
      const target = path[currentIndex + 1];
      if (
        pedestrian.state === "CROSSING_JAYWALK" &&
        target !== undefined &&
        !this.jaywalkTargetIsSafe(target, vehicleIntents)
      ) {
        continue;
      }
      desired.push({
        pedestrianId: pedestrian.id,
        ...(currentCell === undefined
          ? {}
          : { fromCellResourceId: currentCell.conflictResourceId }),
        ...(target === undefined
          ? {}
          : {
              targetCellResourceId: target.conflictResourceId,
              targetRow: row,
              targetColumn: target.column,
            }),
        clears: target === undefined,
        startsJaywalking: false,
      });
    }
    return this.resolvePedestrianTargets(desired);
  }

  private advanceApproachingPedestrians(): void {
    const approaching = [...this.pedestrians.values()]
      .filter((pedestrian) => pedestrian.state === "APPROACHING")
      .sort(
        (left, right) =>
          left.generatedAtTick - right.generatedAtTick ||
          left.id.localeCompare(right.id),
      );
    const occupied = new Set<string>();
    for (const pedestrian of approaching) {
      const path =
        pedestrian.approachPathId === undefined
          ? undefined
          : this.network.pedestrianApproachPaths.get(pedestrian.approachPathId);
      const cell =
        path?.cells[pedestrian.approachIndex ?? 0];
      if (cell !== undefined) {
        occupied.add(
          `${cell.x.toFixed(4)}:${cell.y.toFixed(4)}:${
            pedestrian.targetWaitingSubslot ?? 0
          }`,
        );
      }
    }
    for (const pedestrian of approaching) {
      if (
        pedestrian.nextMoveTick === undefined ||
        this.currentTick + 1 < pedestrian.nextMoveTick
      ) {
        continue;
      }
      const path =
        pedestrian.approachPathId === undefined
          ? undefined
          : this.network.pedestrianApproachPaths.get(pedestrian.approachPathId);
      const currentIndex = pedestrian.approachIndex ?? 0;
      const current = path?.cells[currentIndex];
      const target = path?.cells[currentIndex + 1];
      if (path === undefined || current === undefined) {
        continue;
      }
      const subslot = pedestrian.targetWaitingSubslot ?? 0;
      const currentKey = `${current.x.toFixed(4)}:${current.y.toFixed(4)}:${subslot}`;
      if (target === undefined) {
        if (
          pedestrian.targetWaitingCellId === undefined ||
          pedestrian.targetWaitingSubslot === undefined
        ) {
          throw new Error(
            `Approaching pedestrian ${pedestrian.id} has no waiting target`,
          );
        }
        pedestrian.state = "WAITING";
        pedestrian.waitingCellId = pedestrian.targetWaitingCellId;
        pedestrian.waitingSubslot = pedestrian.targetWaitingSubslot;
        pedestrian.waitingStartedTick = this.currentTick + 1;
        pedestrian.waitingTicks = 0;
        delete pedestrian.approachPathId;
        delete pedestrian.approachIndex;
        delete pedestrian.approachCellId;
        delete pedestrian.targetWaitingCellId;
        delete pedestrian.targetWaitingSubslot;
        delete pedestrian.nextMoveTick;
        occupied.delete(currentKey);
        continue;
      }
      const targetKey = `${target.x.toFixed(4)}:${target.y.toFixed(4)}:${subslot}`;
      if (occupied.has(targetKey)) {
        pedestrian.nextMoveTick = this.currentTick + 2;
        continue;
      }
      occupied.delete(currentKey);
      occupied.add(targetKey);
      pedestrian.approachIndex = currentIndex + 1;
      pedestrian.approachCellId = target.id;
      if (currentIndex + 1 === path.cells.length - 1) {
        if (
          pedestrian.targetWaitingCellId === undefined ||
          pedestrian.targetWaitingSubslot === undefined
        ) {
          throw new Error(
            `Approaching pedestrian ${pedestrian.id} has no waiting target`,
          );
        }
        pedestrian.state = "WAITING";
        pedestrian.waitingCellId = pedestrian.targetWaitingCellId;
        pedestrian.waitingSubslot = pedestrian.targetWaitingSubslot;
        pedestrian.waitingStartedTick = this.currentTick + 1;
        pedestrian.waitingTicks = 0;
        delete pedestrian.approachPathId;
        delete pedestrian.approachIndex;
        delete pedestrian.approachCellId;
        delete pedestrian.targetWaitingCellId;
        delete pedestrian.targetWaitingSubslot;
        delete pedestrian.nextMoveTick;
        continue;
      }
      pedestrian.nextMoveTick =
        (pedestrian.nextMoveTick ?? this.currentTick + 1) +
        PEDESTRIAN_TICKS_PER_CELL;
    }
  }

  private advanceDepartingPedestrians(): void {
    const departing = [...this.pedestrians.values()]
      .filter((pedestrian) => pedestrian.state === "DEPARTING")
      .sort((left, right) => left.id.localeCompare(right.id));
    for (const pedestrian of departing) {
      if (
        pedestrian.nextMoveTick === undefined ||
        this.currentTick + 1 < pedestrian.nextMoveTick
      ) {
        continue;
      }
      const path =
        pedestrian.approachPathId === undefined
          ? undefined
          : this.network.pedestrianApproachPaths.get(pedestrian.approachPathId);
      if (path === undefined) {
        throw new Error(`Missing departure geometry for ${pedestrian.id}`);
      }
      const currentIndex = pedestrian.approachIndex ?? path.cells.length;
      if (currentIndex <= 0) {
        pedestrian.state = "CLEARED";
        delete pedestrian.approachPathId;
        delete pedestrian.approachIndex;
        delete pedestrian.approachCellId;
        delete pedestrian.nextMoveTick;
        this.pedestrianEvents.push({
          kind: "PED_CLEAR",
          tick: this.currentTick + 1,
          pedestrianIds: [pedestrian.id],
          crosswalkId: pedestrian.crosswalkId,
          directions: [pedestrian.direction],
          ...(pedestrian.cohortId === undefined
            ? {}
            : { cohortId: pedestrian.cohortId }),
        });
        continue;
      }
      const nextIndex = currentIndex - 1;
      const target = path.cells[nextIndex];
      if (target === undefined) {
        throw new Error(`Missing departure cell ${nextIndex} for ${pedestrian.id}`);
      }
      pedestrian.approachIndex = nextIndex;
      pedestrian.approachCellId = target.id;
      pedestrian.nextMoveTick =
        (pedestrian.nextMoveTick ?? this.currentTick + 1) +
        PEDESTRIAN_TICKS_PER_CELL;
    }
  }

  private availableJaywalkRow(
    pedestrian: Pedestrian,
    crosswalk: CrosswalkZone,
  ): 0 | 1 | undefined {
    for (const row of [0, 1] as const) {
      const entry = pedestrianPath(crosswalk, pedestrian.direction, row)[0];
      if (
        entry !== undefined &&
        ![...this.pedestrians.values()].some(
          (other) =>
            other.crosswalkId === pedestrian.crosswalkId &&
            other.row === row &&
            other.column === entry.column &&
            other.state !== "CLEARED",
        )
      ) {
        return row;
      }
    }
    return undefined;
  }

  private jaywalkTargetIsSafe(
    target: CrosswalkCell,
    vehicleIntents: readonly VehicleMoveIntent[],
  ): boolean {
    for (const slotId of target.vehicleSlotIds) {
      const separator = slotId.lastIndexOf(":");
      const routeId = slotId.slice(0, separator);
      const targetSlot = Number(slotId.slice(separator + 1));
      if (
        vehicleIntents.some(
          (intent) => {
            const distanceAtTickStart =
              targetSlot - intent.fromHeadSlot;
            const sweepsTarget =
              distanceAtTickStart >= 0 &&
              targetSlot - intent.toHeadSlot <= 0;
            return (
              intent.routeId === routeId &&
              intent.moving &&
              ((distanceAtTickStart >= 0 && distanceAtTickStart <= 4) ||
                sweepsTarget)
            );
          },
        )
      ) {
        return false;
      }
    }
    return true;
  }

  private resolvePedestrianTargets(
    desired: readonly PedestrianMoveIntent[],
  ): PedestrianMoveIntent[] {
    const accepted = new Map<string, PedestrianMoveIntent>();
    const claimedTargets = new Set<string>();
    for (const intent of desired) {
      if (
        intent.targetCellResourceId !== undefined &&
        claimedTargets.has(intent.targetCellResourceId)
      ) {
        continue;
      }
      accepted.set(intent.pedestrianId, intent);
      if (intent.targetCellResourceId !== undefined) {
        claimedTargets.add(intent.targetCellResourceId);
      }
    }

    let changed = true;
    while (changed) {
      changed = false;
      for (const intent of [...accepted.values()]) {
        if (intent.targetCellResourceId === undefined) {
          continue;
        }
        const occupant = [...this.pedestrians.values()].find((pedestrian) => {
          const resourceId = this.pedestrianCellResourceId(pedestrian);
          return resourceId === intent.targetCellResourceId;
        });
        if (occupant === undefined || occupant.id === intent.pedestrianId) {
          continue;
        }
        const occupantMove = accepted.get(occupant.id);
        if (
          occupantMove === undefined ||
          occupantMove.targetCellResourceId === intent.targetCellResourceId
        ) {
          accepted.delete(intent.pedestrianId);
          changed = true;
        }
      }
    }
    return [...accepted.values()];
  }

  private commitPedestrianMoves(
    intents: readonly PedestrianMoveIntent[],
  ): void {
    for (const intent of intents) {
      const pedestrian = this.pedestrians.get(intent.pedestrianId);
      if (pedestrian === undefined) {
        continue;
      }
      if (intent.clears) {
        this.beginPedestrianDeparture(pedestrian);
        delete pedestrian.row;
        delete pedestrian.column;
        this.releaseReservations(pedestrian.id);
        continue;
      }
      if (intent.targetRow === undefined || intent.targetColumn === undefined) {
        throw new Error(
          `Pedestrian move ${pedestrian.id} is missing a target cell`,
        );
      }
      const enteringCrosswalk = pedestrian.column === undefined;
      pedestrian.row = intent.targetRow;
      pedestrian.column = intent.targetColumn;
      if (intent.startsJaywalking) {
        pedestrian.state = "CROSSING_JAYWALK";
        delete pedestrian.waitingCellId;
        delete pedestrian.waitingSubslot;
        pedestrian.scheduledStartTick = this.currentTick + 1;
        pedestrian.nextMoveTick =
          this.currentTick + 1 + PEDESTRIAN_TICKS_PER_CELL;
        const eventTick = this.currentTick + 1;
        this.pendingFirstJaywalks.add(pedestrian.id);
        this.pendingJaywalkWaves.add(
          `${eventTick}:${pedestrian.crosswalkId}`,
        );
        this.pedestrianEvents.push({
          kind: "PED_JAYWALK",
          tick: eventTick,
          pedestrianIds: [pedestrian.id],
          crosswalkId: pedestrian.crosswalkId,
          directions: [pedestrian.direction],
        });
      } else if (!enteringCrosswalk) {
        pedestrian.nextMoveTick =
          (pedestrian.nextMoveTick ?? this.currentTick + 1) +
          PEDESTRIAN_TICKS_PER_CELL;
      }
    }
    this.fillPedestrianWaitingAreas();
  }

  private beginPedestrianDeparture(pedestrian: Pedestrian): void {
    const destinationDirection =
      pedestrian.direction === "A_TO_B" ? "B_TO_A" : "A_TO_B";
    const path = [...this.network.pedestrianApproachPaths.values()]
      .filter(
        (candidate) =>
          candidate.crosswalkId === pedestrian.crosswalkId &&
          candidate.direction === destinationDirection,
      )
      .sort((left, right) => left.id.localeCompare(right.id))[0];
    if (path === undefined || path.cells.length === 0) {
      throw new Error(`Missing departure path for pedestrian ${pedestrian.id}`);
    }
    if (pedestrian.cohortId !== undefined) {
      this.pendingPedestrianCompletions.add(pedestrian.id);
    }
    pedestrian.state = "DEPARTING";
    pedestrian.approachPathId = path.id;
    pedestrian.approachIndex = path.cells.length;
    pedestrian.approachCellId = `DEPARTURE:ENTRY:${path.cornerId}`;
    pedestrian.nextMoveTick =
      this.currentTick + 1 + PEDESTRIAN_TICKS_PER_CELL;
  }

  private queuePedestrianVehicleCollisions(
    pedestrianIntents: readonly PedestrianMoveIntent[],
    vehicleIntents: readonly VehicleMoveIntent[],
  ): void {
    const sweptByPedestrian = new Map<PedestrianId, Set<string>>();
    for (const pedestrian of this.pedestrians.values()) {
      if (
        pedestrian.state !== "CROSSING_RESERVED" &&
        pedestrian.state !== "CROSSING_JAYWALK"
      ) {
        continue;
      }
      const resourceId = this.pedestrianCellResourceId(pedestrian);
      if (resourceId !== undefined) {
        sweptByPedestrian.set(pedestrian.id, new Set([resourceId]));
      }
    }
    for (const intent of pedestrianIntents) {
      const resources =
        sweptByPedestrian.get(intent.pedestrianId) ?? new Set<string>();
      if (intent.fromCellResourceId !== undefined) {
        resources.add(intent.fromCellResourceId);
      }
      if (intent.targetCellResourceId !== undefined) {
        resources.add(intent.targetCellResourceId);
      }
      sweptByPedestrian.set(intent.pedestrianId, resources);
    }

    for (const vehicleIntent of vehicleIntents) {
      for (const [pedestrianId, pedestrianResources] of sweptByPedestrian) {
        const collisionResource = [...pedestrianResources]
          .sort()
          .find((resourceId) => vehicleIntent.resourceIds.has(resourceId));
        if (collisionResource === undefined) {
          continue;
        }
        this.pendingCollisions.push({
          tick: this.currentTick,
          resourceId: collisionResource,
          vehicleIds: [vehicleIntent.vehicleId],
          pedestrianIds: [pedestrianId],
        });
      }
    }
  }

  private pedestrianCellResourceId(
    pedestrian: Pedestrian,
  ): ConflictResourceId | undefined {
    if (pedestrian.row === undefined || pedestrian.column === undefined) {
      return undefined;
    }
    return this.network.crosswalks
      .get(pedestrian.crosswalkId)
      ?.cells.find(
        (cell) =>
          cell.row === pedestrian.row && cell.column === pedestrian.column,
      )?.conflictResourceId;
  }

  private paintImmediatePedestrianOccupations(): void {
    const resources =
      this.reservationTable.get(this.currentTick) ?? new Map();
    for (const pedestrian of this.pedestrians.values()) {
      if (pedestrian.state !== "CROSSING_JAYWALK") {
        continue;
      }
      const resourceId = this.pedestrianCellResourceId(pedestrian);
      if (resourceId !== undefined && !resources.has(resourceId)) {
        resources.set(resourceId, pedestrian.id);
      }
    }
    if (resources.size > 0) {
      this.reservationTable.set(this.currentTick, resources);
    }
  }

  private pedestrianWakeInterrupt(
    intents: readonly PedestrianMoveIntent[],
  ): string | undefined {
    const reasons: string[] = [];
    for (const pedestrian of this.pedestrians.values()) {
      const remaining = Math.max(
        0,
        pedestrian.patienceLimit - pedestrian.waitingTicks,
      );
      if (
        pedestrian.state === "WAITING" &&
        remaining <= PEDESTRIAN_WARNING_REMAINING_TICKS &&
        !this.announcedCriticalPedestrians.has(pedestrian.id)
      ) {
        this.announcedCriticalPedestrians.add(pedestrian.id);
        reasons.push(
          `PEDESTRIAN_PATIENCE pedestrian=${pedestrian.id} remaining=${remaining}`,
        );
      }
    }
    for (const intent of intents) {
      if (
        !intent.startsJaywalking ||
        this.announcedJaywalkPedestrians.has(intent.pedestrianId)
      ) {
        continue;
      }
      this.announcedJaywalkPedestrians.add(intent.pedestrianId);
      reasons.push(`PEDESTRIAN_JAYWALK pedestrian=${intent.pedestrianId}`);
    }
    return reasons.length === 0 ? undefined : reasons.join("; ");
  }

  private updateStationaryTicks(
    positions: ReadonlyMap<VehicleId, string>,
  ): void {
    for (const vehicle of this.vehicles.values()) {
      const previous = positions.get(vehicle.id);
      const moved =
        previous === undefined || previous !== vehiclePositionKey(vehicle);
      if (
        previous !== undefined &&
        isInboundState(vehicle.state) &&
        vehicle.state !== "STALLED" &&
        vehicle.scheduledEnterTick === undefined &&
        (!moved || vehicle.encroaching)
      ) {
        vehicle.driverWaitTicks += 1;
      }
      if (moved) {
        vehicle.stationaryTicks = 0;
        continue;
      }
      vehicle.stationaryTicks += 1;
    }
  }

  buildObservation(
    financialBalance: number,
    interruptReason?: string,
    workingMemoryTop: WorkingMemoryTop | null = null,
  ): CompactObservation {
    const candidateVehicles = this.stoplineCandidates();
    const stoplineCandidates = candidateVehicles.map((vehicle) => ({
      vehicleId: vehicle.id,
      type: vehicle.type,
      lane: vehicle.inboundLaneId,
      waitingTicks: vehicle.waitingTicks,
      routeId: vehicle.routeId,
      ...(vehicle.intentRouteId === vehicle.routeId
        ? {}
        : { intentRouteId: vehicle.intentRouteId }),
    }));
    const blockedByRoute = new Map<RouteId, CompactObservation["blockedRoutes"][number]>();
    for (const vehicle of candidateVehicles) {
      const blockedUntilTick = routeBlockedUntilTick(
        vehicle,
        this.currentTick,
        this.network,
        this.reservationTable,
      );
      if (blockedUntilTick === undefined) {
        continue;
      }
      const existing = blockedByRoute.get(vehicle.routeId);
      blockedByRoute.set(vehicle.routeId, {
        routeId: vehicle.routeId,
        blockedUntilTick: Math.max(
          existing?.blockedUntilTick ?? blockedUntilTick,
          blockedUntilTick,
        ),
        blockKind: "RESERVATION",
      });
    }
    for (const incident of this.incidents) {
      if (incident.status !== "OPEN") {
        continue;
      }
      const estimatedClearTick =
        this.currentTick + this.estimatedIncidentClearanceTicks(incident);
      for (const routeId of this.routesUsing(incident.lockedResourceIds)) {
        const existing = blockedByRoute.get(routeId);
        blockedByRoute.set(routeId, {
          routeId,
          blockedUntilTick: Math.max(
            existing?.blockedUntilTick ?? estimatedClearTick,
            estimatedClearTick,
          ),
          blockKind: "INCIDENT",
          incidentIds: [
            ...new Set([...(existing?.incidentIds ?? []), incident.id]),
          ].sort(),
        });
      }
    }
    const blockedRoutes = [...blockedByRoute.values()].sort((left, right) =>
      left.routeId.localeCompare(right.routeId),
    );

    const observation: CompactObservation = {
      currentTick: this.currentTick,
      financialBalance,
      stoplineCandidates,
      blockedRoutes,
      candidateConflicts: findCandidateConflicts(
        candidateVehicles,
        this.currentTick,
        this.network,
      ),
      candidateConflictScope: "STOPLINE_HEADS_SAME_TICK",
      dischargingLanes: this.dischargingLanes(),
      revokedAdmissions: this.recentAdmissionRevocations(),
      activeVehicleMotions: [...this.vehicles.values()]
        .filter(
          (vehicle) =>
            vehicle.state === "CROSSING" ||
            vehicle.state === "EXIT_BLOCKED" ||
            vehicle.scheduledEnterTick !== undefined,
        )
        .map((vehicle) => ({
          vehicleId: vehicle.id,
          routeId: vehicle.routeId,
          state:
            vehicle.scheduledEnterTick === undefined
              ? vehicle.state as "CROSSING" | "EXIT_BLOCKED"
              : "SCHEDULED_ENTERING" as const,
          speedProfile: vehicle.speedProfile,
          ...(vehicle.scheduledEnterTick === undefined
            ? {}
            : { scheduledEnterTick: vehicle.scheduledEnterTick }),
        }))
        .sort((left, right) => left.vehicleId.localeCompare(right.vehicleId)),
      lanePressureSignals: this.getLanePressureSignals(),
      workingMemoryTop,
      emergencyAlerts: this.emergencyAlerts(),
      emergencyNotices: this.takeEmergencyNotices(),
      stalledVehicles: this.stalledViews(),
      activeLaneHolds: this.activeLaneHoldViews(),
      exitHolds: this.exitHoldViews(),
      crosswalkHolds: this.crosswalkHoldViews(),
      upstreamQueues: [...this.upstreamQueues.entries()]
        .map(([laneId, queue]) => ({
          laneId,
          waiting: queue.arrivals.length - queue.nextIndex,
        }))
        .filter(({ waiting }) => waiting > 0)
        .sort((left, right) => left.laneId.localeCompare(right.laneId)),
      crosswalks: this.crosswalkPedestrianSummaries(),
      pedestrianAlerts: this.pedestrianAlerts(),
      driverAlerts: this.driverAlerts(),
      laneGuidanceOpportunities: this.laneGuidanceOpportunities(),
      activeLaneGuidancePermits: [...this.laneGuidancePermits.values()].sort(
        (left, right) => left.vehicleId.localeCompare(right.vehicleId),
      ),
    };
    return interruptReason === undefined
      ? observation
      : { ...observation, interruptReason };
  }

  private crosswalkPedestrianSummaries() {
    return [...this.network.crosswalks.keys()]
      .sort()
      .map((crosswalkId) => ({
        crosswalkId,
        phaseBatchCap: PEDESTRIAN_PHASE_BATCH_CAP,
        warningRemainingTicks: PEDESTRIAN_WARNING_REMAINING_TICKS,
        directions: (["A_TO_B", "B_TO_A"] as const).map((direction) => {
          const pedestrians = [...this.pedestrians.values()].filter(
            (pedestrian) =>
              pedestrian.crosswalkId === crosswalkId &&
              pedestrian.direction === direction &&
              pedestrian.state !== "CLEARED",
          );
          const waiting = pedestrians.filter(
            (pedestrian) => pedestrian.state === "WAITING",
          );
          const approaching = pedestrians.filter(
            (pedestrian) => pedestrian.state === "APPROACHING",
          );
          const crossing = pedestrians.filter(
            (pedestrian) =>
              pedestrian.state === "CROSSING_RESERVED" ||
              pedestrian.state === "CROSSING_JAYWALK",
          );
          const remaining = waiting.map((pedestrian) =>
            Math.max(
              0,
              pedestrian.patienceLimit - pedestrian.waitingTicks,
            ),
          );
          const clearTicks = crossing.map((pedestrian) =>
            this.estimatedPedestrianClearTick(pedestrian),
          );
          return {
            direction,
            approaching: approaching.length,
            waiting: waiting.length,
            waitingCapacity:
              PEDESTRIAN_WAITING_AREA_CAPACITY,
            externalBacklog: this.externalPedestrianBacklog.filter(
              (arrival) =>
                arrival.crosswalkId === crosswalkId &&
                arrival.direction === direction,
            ).length,
            crossing: crossing.length,
            minPatienceRemaining:
              remaining.length === 0 ? null : Math.min(...remaining),
            clearTick:
              clearTicks.length === 0 ? null : Math.max(...clearTicks),
            jaywalking: crossing.filter(
              (pedestrian) =>
                pedestrian.state === "CROSSING_JAYWALK",
            ).length,
          };
        }),
      }));
  }

  private driverAlerts(): DriverAlert[] {
    if (!this.dynamics.vehicleAggression) {
      return [];
    }
    const alerts: DriverAlert[] = [];
    for (const vehicle of this.vehicles.values()) {
      if (
        !isInboundState(vehicle.state) ||
        vehicle.state === "STALLED" ||
        vehicle.scheduledEnterTick !== undefined ||
        vehicle.violation !== undefined
      ) {
        continue;
      }
      const temperament = temperamentFor(vehicle.type);
      if (temperament === "EXEMPT") {
        continue;
      }
      const patienceRemaining = Math.max(0, driverPatienceRemaining(vehicle));
      if (patienceRemaining > DRIVER_WARNING_REMAINING_TICKS) {
        continue;
      }
      alerts.push({
        vehicleId: vehicle.id,
        laneId: vehicle.inboundLaneId,
        distanceToStopline: this.distanceToStopline(vehicle),
        temperament,
        patienceRemaining,
      });
    }
    return alerts
      .sort(
        (left, right) =>
          left.patienceRemaining - right.patienceRemaining ||
          left.distanceToStopline - right.distanceToStopline ||
          left.vehicleId.localeCompare(right.vehicleId),
      )
      .slice(0, DRIVER_ALERT_LIMIT);
  }

  private pedestrianAlerts(): PedestrianAlert[] {
    const alerts: PedestrianAlert[] = [];
    for (const pedestrian of this.pedestrians.values()) {
      const patienceRemaining = Math.max(
        0,
        pedestrian.patienceLimit - pedestrian.waitingTicks,
      );
      if (
        pedestrian.state === "WAITING" &&
        patienceRemaining <= PEDESTRIAN_WARNING_REMAINING_TICKS
      ) {
        alerts.push({
          pedestrianId: pedestrian.id,
          crosswalkId: pedestrian.crosswalkId,
          direction: pedestrian.direction,
          kind: "PATIENCE_CRITICAL",
          patienceRemaining,
        });
      } else if (pedestrian.state === "CROSSING_JAYWALK") {
        alerts.push({
          pedestrianId: pedestrian.id,
          crosswalkId: pedestrian.crosswalkId,
          direction: pedestrian.direction,
          kind: "JAYWALKING",
          patienceRemaining,
        });
      }
    }
    return alerts.sort((left, right) =>
      left.pedestrianId.localeCompare(right.pedestrianId),
    );
  }

  private estimatedPedestrianClearTick(pedestrian: Pedestrian): TickNumber {
    if (pedestrian.state === "CROSSING_RESERVED") {
      return (
        (pedestrian.scheduledStartTick ?? this.currentTick) +
        8 * PEDESTRIAN_TICKS_PER_CELL
      );
    }
    const crosswalk = this.network.crosswalks.get(pedestrian.crosswalkId);
    if (
      crosswalk === undefined ||
      pedestrian.row === undefined ||
      pedestrian.column === undefined
    ) {
      return this.currentTick;
    }
    const path = pedestrianPath(
      crosswalk,
      pedestrian.direction,
      pedestrian.row,
    );
    const index = path.findIndex(
      (cell) => cell.column === pedestrian.column,
    );
    return (
      this.currentTick +
      Math.max(1, path.length - Math.max(0, index)) *
        PEDESTRIAN_TICKS_PER_CELL
    );
  }

  getQueueOccupancyRatio(laneId: LaneId): number {
    const lane = this.network.inboundLanes.get(laneId);
    if (lane === undefined) {
      throw new Error(`Unknown inbound lane: ${laneId}`);
    }
    const queuedSlots = [...this.vehicles.values()]
      .filter(
        (vehicle) =>
          vehicle.inboundLaneId === laneId &&
          isInboundState(vehicle.state),
      )
      .reduce((sum, vehicle) => sum + vehicle.lengthSlots, 0);
    const activeSlots = this.activeInboundBlockingSlots(lane).size;
    return Math.min(1, (queuedSlots + activeSlots) / lane.capacitySlots);
  }

  getLanePressureSignals(): LanePressureSignal[] {
    return [...this.network.inboundLanes.keys()]
      .map((laneId) => {
        const queued = this.inboundVehiclesForLane(laneId).filter(isWaitingVehicle);
        return {
          laneId,
          queuedVehicles: queued.length,
          queuedPassengers: queued.reduce(
            (sum, vehicle) => sum + passengersFor(vehicle.type),
            0,
          ),
          capacityOccupancy: this.getQueueOccupancyRatio(laneId),
        };
      })
      .filter(
        (signal) =>
          signal.queuedVehicles > 0 || signal.capacityOccupancy >= 0.5,
      )
      .sort(
        (left, right) =>
          right.capacityOccupancy - left.capacityOccupancy ||
          left.laneId.localeCompare(right.laneId),
      );
  }

  inspectLaneQueue(laneId: LaneId, depth = 3): LaneQueueInspection {
    if (!this.network.inboundLanes.has(laneId)) {
      throw new Error(`Unknown inbound lane: ${laneId}`);
    }
    const boundedDepth = Math.max(1, Math.min(10, Math.trunc(depth)));
    const inboundVehicles = this.inboundVehiclesForLane(laneId);
    const queuedVehicles = inboundVehicles.filter(isWaitingVehicle);

    return {
      laneId,
      totalQueued: queuedVehicles.length,
      capacityOccupancy: this.getQueueOccupancyRatio(laneId),
      maxWaitTicks: queuedVehicles.reduce(
        (maximum, vehicle) => Math.max(maximum, vehicle.waitingTicks),
        0,
      ),
      vehiclesBehind: queuedVehicles.slice(0, boundedDepth).map((vehicle) => ({
        id: vehicle.id,
        type: vehicle.type,
        waitTicks: vehicle.waitingTicks,
        state: vehicle.state,
        routeId: vehicle.routeId,
        distanceToStopline: this.distanceToStopline(vehicle),
        validGuidanceTargetLaneIds:
          this.validLaneGuidanceTargetLaneIds(vehicle),
      })),
    };
  }

  /** Read-only slot layout of every approach and exit lane plus crosswalk cells. */
  spatialSnapshot(): SpatialSnapshot {
    const inbound = new Map<LaneId, LaneSlotVehicle[]>();
    const outbound = new Map<LaneId, LaneSlotVehicle[]>();
    const coveredSlotIds = new Set<string>();
    for (const vehicle of this.vehicles.values()) {
      if (isInboundState(vehicle.state)) {
        const lane = this.network.inboundLanes.get(vehicle.inboundLaneId);
        if (lane === undefined) {
          continue;
        }
        const list = inbound.get(lane.id) ?? [];
        list.push({
          vehicleId: vehicle.id,
          type: vehicle.type,
          headIndex: lane.capacitySlots - 1 - vehicle.inboundHeadSlot,
          lengthSlots: vehicle.lengthSlots,
          scheduled: vehicle.scheduledEnterTick !== undefined,
        });
        inbound.set(lane.id, list);
        continue;
      }
      if (vehicle.state === "OUTBOUND") {
        const list = outbound.get(vehicle.outboundLaneId) ?? [];
        list.push({
          vehicleId: vehicle.id,
          type: vehicle.type,
          headIndex: vehicle.outboundHeadSlot,
          lengthSlots: vehicle.lengthSlots,
          scheduled: false,
        });
        outbound.set(vehicle.outboundLaneId, list);
        continue;
      }
      if (vehicle.state === "DESPAWNED") {
        continue;
      }
      for (let body = 0; body < vehicle.lengthSlots; body += 1) {
        coveredSlotIds.add(`${vehicle.routeId}:${vehicle.trajectoryHeadSlot - body}`);
      }
    }
    const laneViews = (
      lanes: ReadonlyMap<LaneId, Lane>,
      byLane: ReadonlyMap<LaneId, LaneSlotVehicle[]>,
    ): LaneSlotView[] =>
      [...lanes.values()]
        .map((lane) => ({
          laneId: lane.id,
          capacitySlots: lane.capacitySlots,
          vehicles: (byLane.get(lane.id) ?? []).sort(
            (left, right) => left.headIndex - right.headIndex,
          ),
        }))
        .sort((left, right) => left.laneId.localeCompare(right.laneId));
    const pedestrianMarks = new Map<string, CrosswalkCellMark>();
    const markRank: Record<CrosswalkCellMark, number> = { v: 0, c: 1, j: 2, x: 3 };
    const mark = (key: string, value: CrosswalkCellMark): void => {
      const existing = pedestrianMarks.get(key);
      if (existing === undefined || markRank[value] > markRank[existing]) {
        pedestrianMarks.set(key, value);
      }
    };
    for (const pedestrian of this.pedestrians.values()) {
      if (pedestrian.row === undefined || pedestrian.column === undefined) {
        continue;
      }
      const value: CrosswalkCellMark | undefined =
        pedestrian.state === "INJURED"
          ? "x"
          : pedestrian.state === "CROSSING_JAYWALK"
            ? "j"
            : pedestrian.state === "CROSSING_RESERVED"
              ? "c"
              : undefined;
      if (value !== undefined) {
        mark(`${pedestrian.crosswalkId}|${pedestrian.row}|${pedestrian.column}`, value);
      }
    }
    const vehicleReservedUntil = new Map<ConflictResourceId, TickNumber>();
    const crosswalkCells = this.crosswalkCellIndex();
    for (const [tick, owners] of this.reservationTable) {
      if (tick < this.currentTick) {
        continue;
      }
      for (const [resourceId, owner] of owners) {
        const cell = crosswalkCells.get(resourceId);
        if (cell === undefined || !this.vehicles.has(owner)) {
          continue;
        }
        vehicleReservedUntil.set(
          cell.crosswalkId,
          Math.max(vehicleReservedUntil.get(cell.crosswalkId) ?? tick, tick),
        );
      }
    }
    const crosswalks: CrosswalkSlotView[] = [...this.network.crosswalks.values()]
      .map((zone) => {
        const cells: CrosswalkCellView[] = [];
        for (const cell of zone.cells) {
          const key = `${zone.id}|${cell.row}|${cell.column}`;
          if (cell.vehicleSlotIds.some((slotId) => coveredSlotIds.has(slotId))) {
            mark(key, "v");
          }
          const value = pedestrianMarks.get(key);
          if (value !== undefined) {
            cells.push({ row: cell.row, column: cell.column, mark: value });
          }
        }
        const reservedUntil = vehicleReservedUntil.get(zone.id);
        return {
          crosswalkId: zone.id,
          columns: Math.max(0, ...zone.cells.map((cell) => cell.column + 1)),
          cells,
          ...(reservedUntil === undefined ? {} : { vehicleReservedUntil: reservedUntil }),
        };
      })
      .sort((left, right) => left.crosswalkId.localeCompare(right.crosswalkId));
    return {
      inbound: laneViews(this.network.inboundLanes, inbound),
      outbound: laneViews(this.network.outboundLanes, outbound),
      crosswalks,
    };
  }

  /** Read-only view of junction cells: who sits where now and which cells are booked soon. */
  junctionSnapshot(horizonTicks: number): JunctionSnapshot {
    const horizon = Math.max(1, Math.min(10, Math.trunc(horizonTicks)));
    const routed = new Map<string, Point>();
    let minCoordinate = Number.POSITIVE_INFINITY;
    let maxCoordinate = Number.NEGATIVE_INFINITY;
    for (const trajectory of this.network.trajectories.values()) {
      for (const slot of trajectory.slots) {
        routed.set(`${slot.x}:${slot.y}`, { x: slot.x, y: slot.y });
        minCoordinate = Math.min(minCoordinate, slot.x, slot.y);
        maxCoordinate = Math.max(maxCoordinate, slot.x, slot.y);
      }
    }
    const spacePoint = (resourceId: string): Point | undefined => {
      if (!resourceId.startsWith("SPACE:")) {
        return undefined;
      }
      const [, x, y] = resourceId.split(":");
      return { x: Number(x), y: Number(y) };
    };
    const vehicleCells: JunctionCellVehicle[] = [];
    const vehicles: JunctionVehicleView[] = [];
    const now = this.reservationTable.get(this.currentTick);
    const reservedUntil = new Map<VehicleId, TickNumber>();
    for (const [tick, owners] of this.reservationTable) {
      if (tick < this.currentTick) {
        continue;
      }
      for (const owner of owners.values()) {
        reservedUntil.set(owner, Math.max(reservedUntil.get(owner) ?? tick, tick));
      }
    }
    for (const vehicle of this.vehicles.values()) {
      const inJunction =
        vehicle.state === "CROSSING" ||
        vehicle.state === "EXIT_BLOCKED" ||
        vehicle.state === "EVACUATING" ||
        vehicle.state === "ACCIDENT_STOPPED";
      if (!inJunction && vehicle.scheduledEnterTick === undefined) {
        continue;
      }
      const trajectory = this.network.trajectories.get(vehicle.routeId);
      let stale = false;
      if (inJunction && trajectory !== undefined) {
        for (let body = 0; body < vehicle.lengthSlots; body += 1) {
          const slot = trajectory.slots[vehicle.trajectoryHeadSlot - body];
          if (slot === undefined) {
            continue;
          }
          vehicleCells.push({
            x: slot.x,
            y: slot.y,
            vehicleId: vehicle.id,
            type: vehicle.type,
            head: body === 0,
          });
          if (
            (vehicle.state === "CROSSING" || vehicle.state === "EXIT_BLOCKED") &&
            slot.conflictResourceIds.some(
              (resourceId) => resourceId.startsWith("SPACE:") && now?.get(resourceId) !== vehicle.id,
            )
          ) {
            stale = true;
          }
        }
      }
      const enterTick = vehicle.admittedAtTick ?? vehicle.scheduledEnterTick;
      const until = reservedUntil.get(vehicle.id);
      vehicles.push({
        vehicleId: vehicle.id,
        type: vehicle.type,
        routeId: vehicle.routeId,
        state: vehicle.state,
        speedProfile: vehicle.speedProfile,
        ...(enterTick === undefined ? {} : { enterTick }),
        ...(until === undefined ? {} : { reservedUntilTick: until }),
        stale,
      });
    }
    const lockedCells = [...this.lockedResources]
      .map(spacePoint)
      .filter((point): point is Point => point !== undefined);
    const pedestrianCells: Point[] = [];
    for (const pedestrian of this.pedestrians.values()) {
      if (
        pedestrian.row === undefined ||
        pedestrian.column === undefined ||
        (pedestrian.state !== "CROSSING_RESERVED" &&
          pedestrian.state !== "CROSSING_JAYWALK" &&
          pedestrian.state !== "INJURED")
      ) {
        continue;
      }
      const cell = this.network.crosswalks
        .get(pedestrian.crosswalkId)
        ?.cells.find(
          (item) => item.row === pedestrian.row && item.column === pedestrian.column,
        );
      if (cell !== undefined) {
        pedestrianCells.push({ x: Math.round(cell.x), y: Math.round(cell.y) });
      }
    }
    const earliest = new Map<string, Point & { tickOffset: number }>();
    const crosswalkCells = this.crosswalkCellIndex();
    const crosswalkEarliest = new Map<ConflictResourceId, number>();
    for (let offset = 0; offset < horizon; offset += 1) {
      const owners = this.reservationTable.get(this.currentTick + offset);
      if (owners === undefined) {
        continue;
      }
      for (const [resourceId, owner] of owners) {
        if (
          crosswalkCells.has(resourceId) &&
          this.vehicles.has(owner) &&
          !crosswalkEarliest.has(resourceId)
        ) {
          crosswalkEarliest.set(resourceId, offset);
        }
        const point = spacePoint(resourceId);
        if (point === undefined) {
          continue;
        }
        const key = `${point.x}:${point.y}`;
        if (!earliest.has(key)) {
          earliest.set(key, { ...point, tickOffset: offset });
        }
      }
    }
    return {
      tick: this.currentTick,
      horizonTicks: horizon,
      minCoordinate,
      maxCoordinate,
      routedCells: [...routed.values()],
      vehicleCells,
      lockedCells,
      pedestrianCells,
      reservedCells: [...earliest.values()],
      crosswalkReservations: [...this.network.crosswalks.values()]
        .map((zone) => ({
          crosswalkId: zone.id,
          columns: Math.max(0, ...zone.cells.map((cell) => cell.column + 1)),
          cells: zone.cells.flatMap((cell) => {
            const tickOffset = crosswalkEarliest.get(cell.conflictResourceId);
            return tickOffset === undefined
              ? []
              : [{ row: cell.row, column: cell.column, tickOffset }];
          }),
        }))
        .sort((left, right) => left.crosswalkId.localeCompare(right.crosswalkId)),
      vehicles: vehicles.sort((left, right) => left.vehicleId.localeCompare(right.vehicleId)),
    };
  }

  private crosswalkCellIndex(): ReadonlyMap<ConflictResourceId, { crosswalkId: ConflictResourceId }> {
    if (this.crosswalkCellCache === undefined) {
      const index = new Map<ConflictResourceId, { crosswalkId: ConflictResourceId }>();
      for (const zone of this.network.crosswalks.values()) {
        for (const cell of zone.cells) {
          index.set(cell.conflictResourceId, { crosswalkId: zone.id });
        }
      }
      this.crosswalkCellCache = index;
    }
    return this.crosswalkCellCache;
  }

  guideInboundLaneChange(
    vehicleId: VehicleId,
    targetLaneId: LaneId,
  ): LaneGuidanceResult {
    const vehicle = this.vehicles.get(vehicleId);
    if (vehicle === undefined) {
      return { ok: false, error: "UNKNOWN_VEHICLE" };
    }
    if (!isInboundState(vehicle.state)) {
      return { ok: false, error: "VEHICLE_NOT_INBOUND", vehicleId };
    }
    if (vehicle.state === "STALLED") {
      return { ok: false, error: "VEHICLE_STALLED", vehicleId };
    }
    if (vehicle.scheduledEnterTick !== undefined) {
      return { ok: false, error: "VEHICLE_SCHEDULED", vehicleId };
    }

    const distanceToStopline = this.distanceToStopline(vehicle);
    if (
      distanceToStopline < this.dynamics.laneGuidanceNearSlots ||
      distanceToStopline > this.dynamics.laneGuidanceFarSlots
    ) {
      return {
        ok: false,
        error: "NOT_IN_GUIDANCE_ZONE",
        vehicleId,
        distanceToStopline,
      };
    }

    const validTargetLaneIds = this.validLaneGuidanceTargetLaneIds(vehicle);
    if (!this.network.inboundLanes.has(targetLaneId)) {
      return {
        ok: false,
        error: "UNKNOWN_TARGET_LANE",
        vehicleId,
        validTargetLaneIds,
      };
    }
    if (!validTargetLaneIds.includes(targetLaneId)) {
      return {
        ok: false,
        error: "TARGET_NOT_ADJACENT",
        vehicleId,
        validTargetLaneIds,
      };
    }
    if (this.heldInboundLanes.has(targetLaneId)) {
      return {
        ok: false,
        error: "TARGET_LANE_HELD",
        vehicleId,
        validTargetLaneIds,
      };
    }

    const guided = this.guidanceTrajectory(vehicle.intentRouteId, targetLaneId);
    if (guided === undefined) {
      return {
        ok: false,
        error: "MANEUVER_NOT_SUPPORTED",
        vehicleId,
        validTargetLaneIds,
      };
    }
    if (this.severedRouteIds().includes(guided.id)) {
      return {
        ok: false,
        error: "TARGET_SEVERED",
        vehicleId,
        validTargetLaneIds,
      };
    }
    const blocker = this.occupantInRange(
      targetLaneId,
      vehicle.inboundHeadSlot,
      vehicle.lengthSlots,
      new Set([vehicle.id]),
    );
    if (blocker !== undefined) {
      return {
        ok: false,
        error: "TARGET_LANE_SLOT_OCCUPIED",
        vehicleId,
        validTargetLaneIds,
        blockingVehicleId: blocker.vehicleId,
        blockedSlot: blocker.slot,
      };
    }

    const sourceLaneId = vehicle.inboundLaneId;
    this.applyInboundTransfer([{ vehicle, trajectory: guided }]);
    this.revokeLaneSchedules(targetLaneId, "LANE_TRANSFER");
    const permit: LaneGuidancePermit = {
      vehicleId,
      sourceLaneId,
      targetLaneId,
      intentRouteId: vehicle.intentRouteId,
      guidedRouteId: guided.id,
      grantedAtTick: this.currentTick,
    };
    this.laneGuidancePermits.set(vehicleId, permit);
    this.incidentLog.push({
      kind: "LANE_GUIDANCE",
      tick: this.currentTick,
      vehicleId,
      vehicleIds: [vehicleId],
      sourceLaneId,
      targetLaneId,
      intentRouteId: vehicle.intentRouteId,
      guidedRouteId: guided.id,
      routeId: guided.id,
    });
    return {
      ok: true,
      vehicleId,
      sourceLaneId,
      targetLaneId,
      intentRouteId: vehicle.intentRouteId,
      guidedRouteId: guided.id,
      distanceToStopline,
      validTargetLaneIds,
    };
  }

  exportCheckpoint(): EngineCheckpoint {
    return {
      version: 1,
      nextVehicleSequence: this.nextVehicleSequence,
      nextPedestrianCohortSequence: this.nextPedestrianCohortSequence,
      nextIncidentSequence: this.nextIncidentSequence,
      currentTick: this._currentTick,
      demandTick: this.demandTick,
      demandSlot: this.demandSlot,
      vehicles: [...this.vehicles.values()].map((vehicle) => ({ ...vehicle })),
      pedestrians: [...this.pedestrians.values()].map((pedestrian) => ({
        ...pedestrian,
      })),
      reservationTable: [...this.reservationTable.entries()]
        .sort((left, right) => left[0] - right[0])
        .map(([tick, resources]) => ({
          tick,
          resources: [...resources.entries()]
            .sort((left, right) => left[0].localeCompare(right[0]))
            .map(([resourceId, actorId]) => ({ resourceId, actorId })),
        })),
      pendingCollisions: this.pendingCollisions.map((collision) => ({
        ...collision,
        vehicleIds: [...collision.vehicleIds],
        ...(collision.pedestrianIds === undefined
          ? {}
          : { pedestrianIds: [...collision.pedestrianIds] }),
      })),
      activatedCollisionKeys: [...this.activatedCollisionKeys].sort(),
      incidents: this.incidents.map((incident) => ({
        ...incident,
        vehicleIds: [...incident.vehicleIds],
        pedestrianIds: [...incident.pedestrianIds],
        lockedResourceIds: [...incident.lockedResourceIds],
        collisionOutcomes: incident.collisionOutcomes.map((outcome) => ({
          ...outcome,
        })),
      })),
      lockedResources: [...this.lockedResources].sort(),
      exitBlockedResources: [...this.exitBlockedResources].sort(),
      heldInboundLanes: [...this.heldInboundLanes.values()].sort((left, right) =>
        left.laneId.localeCompare(right.laneId),
      ),
      upstreamQueues: [...this.upstreamQueues.entries()]
        .sort((left, right) => left[0].localeCompare(right[0]))
        .map(([laneId, queue]) => ({
          laneId,
          nextIndex: queue.nextIndex,
          arrivals: queue.arrivals.map((arrival) => ({ ...arrival })),
        })),
      processedScheduledArrivals: [...this.processedScheduledArrivals].sort(),
      processedPedestrianArrivals: [...this.processedPedestrianArrivals].sort(),
      externalPedestrianBacklog: this.externalPedestrianBacklog.map(
        (arrival) => ({ ...arrival }),
      ),
      announcedCriticalPedestrians: [...this.announcedCriticalPedestrians].sort(),
      announcedJaywalkPedestrians: [...this.announcedJaywalkPedestrians].sort(),
      announcedEmergencyEdges: [...this.announcedEmergencyEdges].sort(),
      towTasks: [...this.towTasks.values()].sort((left, right) =>
        left.vehicleId.localeCompare(right.vehicleId),
      ),
      laneGuidancePermits: [...this.laneGuidancePermits.values()].sort(
        (left, right) => left.vehicleId.localeCompare(right.vehicleId),
      ),
      incidentLog: this.incidentLog.map((entry) => ({ ...entry })),
      pedestrianEvents: this.pedestrianEvents.map((event) => ({ ...event })),
      pendingPedestrianCompletions: [...this.pendingPedestrianCompletions].sort(),
      pendingJaywalkWaves: [...this.pendingJaywalkWaves].sort(),
      pendingFirstJaywalks: [...this.pendingFirstJaywalks].sort(),
      pendingPedestrianCollisions: [...this.pendingPedestrianCollisions].sort(),
      lastPedestrianDelaySettlementTick: this.lastPedestrianDelaySettlementTick,
      pedestrianPatienceFrozen: this.pedestrianPatienceFrozen,
      secondaryAdmitCount: this.secondaryAdmitCount,
      pendingTowCharges: this.pendingTowCharges,
      pendingSchoolBusAccidents: this.pendingSchoolBusAccidents,
      aggressionCounts: { ...this.aggressionCounts },
      pendingTailgateLeaders: [...this.pendingTailgateLeaders].sort(),
      nextScheduledAdmissionOrder: this.nextScheduledAdmissionOrder,
      admissionRevocations: this.admissionRevocations.map((entry) => ({
        ...entry,
        vehicleIds: [...entry.vehicleIds],
      })),
    };
  }

  restoreCheckpoint(checkpoint: EngineCheckpoint): void {
    if (checkpoint.version !== 1) {
      throw new Error(`Unsupported engine checkpoint version: ${checkpoint.version}`);
    }
    this.nextVehicleSequence = checkpoint.nextVehicleSequence;
    this.nextPedestrianCohortSequence = checkpoint.nextPedestrianCohortSequence;
    this.nextIncidentSequence = checkpoint.nextIncidentSequence;
    this._currentTick = checkpoint.currentTick;
    this.demandTick = checkpoint.demandTick;
    this.demandSlot = checkpoint.demandSlot;
    this.vehicles.clear();
    for (const vehicle of checkpoint.vehicles) {
      const restored: Vehicle = { ...vehicle };
      restored.driverPatienceLimit ??= EXEMPT_DRIVER_PATIENCE;
      restored.driverWaitTicks ??= 0;
      this.vehicles.set(vehicle.id, restored);
    }
    this.pedestrians.clear();
    for (const pedestrian of checkpoint.pedestrians) {
      this.pedestrians.set(pedestrian.id, { ...pedestrian });
    }
    this.reservationTable = new Map(
      checkpoint.reservationTable.map((row) => [
        row.tick,
        new Map(row.resources.map((entry) => [entry.resourceId, entry.actorId])),
      ]),
    );
    this.pendingCollisions = checkpoint.pendingCollisions.map((collision) => ({
      ...collision,
      vehicleIds: [...collision.vehicleIds],
      ...(collision.pedestrianIds === undefined
        ? {}
        : { pedestrianIds: [...collision.pedestrianIds] }),
    }));
    this.activatedCollisionKeys.clear();
    for (const key of checkpoint.activatedCollisionKeys) {
      this.activatedCollisionKeys.add(key);
    }
    this.incidents.length = 0;
    for (const incident of checkpoint.incidents) {
      this.incidents.push({
        ...incident,
        vehicleIds: [...incident.vehicleIds],
        pedestrianIds: [...incident.pedestrianIds],
        lockedResourceIds: [...incident.lockedResourceIds],
        collisionOutcomes: incident.collisionOutcomes.map((outcome) => ({
          ...outcome,
        })),
      });
    }
    this.lockedResources.clear();
    for (const resourceId of checkpoint.lockedResources) {
      this.lockedResources.add(resourceId);
    }
    this.exitBlockedResources.clear();
    for (const resourceId of checkpoint.exitBlockedResources) {
      this.exitBlockedResources.add(resourceId);
    }
    this.heldInboundLanes.clear();
    for (const hold of checkpoint.heldInboundLanes) {
      this.heldInboundLanes.set(hold.laneId, { ...hold });
    }
    this.upstreamQueues.clear();
    for (const queue of checkpoint.upstreamQueues) {
      this.upstreamQueues.set(queue.laneId, {
        nextIndex: queue.nextIndex,
        arrivals: queue.arrivals.map((arrival) => ({ ...arrival })),
      });
    }
    this.processedScheduledArrivals.clear();
    for (const key of checkpoint.processedScheduledArrivals) {
      this.processedScheduledArrivals.add(key);
    }
    this.processedPedestrianArrivals.clear();
    for (const key of checkpoint.processedPedestrianArrivals) {
      this.processedPedestrianArrivals.add(key);
    }
    this.externalPedestrianBacklog = checkpoint.externalPedestrianBacklog.map(
      (arrival) => ({ ...arrival }),
    );
    this.announcedCriticalPedestrians.clear();
    for (const id of checkpoint.announcedCriticalPedestrians) {
      this.announcedCriticalPedestrians.add(id);
    }
    this.announcedJaywalkPedestrians.clear();
    for (const id of checkpoint.announcedJaywalkPedestrians) {
      this.announcedJaywalkPedestrians.add(id);
    }
    this.announcedEmergencyEdges.clear();
    for (const edge of checkpoint.announcedEmergencyEdges) {
      this.announcedEmergencyEdges.add(edge);
    }
    this.towTasks.clear();
    for (const task of checkpoint.towTasks) {
      this.towTasks.set(task.vehicleId, { ...task });
    }
    this.laneGuidancePermits.clear();
    for (const permit of checkpoint.laneGuidancePermits) {
      this.laneGuidancePermits.set(permit.vehicleId, { ...permit });
    }
    this.incidentLog = checkpoint.incidentLog.map((entry) => ({ ...entry }));
    this.pedestrianEvents = checkpoint.pedestrianEvents.map((event) => ({
      ...event,
    }));
    this.pendingPedestrianCompletions.clear();
    for (const id of checkpoint.pendingPedestrianCompletions) {
      this.pendingPedestrianCompletions.add(id);
    }
    this.pendingJaywalkWaves.clear();
    for (const key of checkpoint.pendingJaywalkWaves) {
      this.pendingJaywalkWaves.add(key);
    }
    this.pendingFirstJaywalks.clear();
    for (const id of checkpoint.pendingFirstJaywalks) {
      this.pendingFirstJaywalks.add(id);
    }
    this.pendingPedestrianCollisions.clear();
    for (const id of checkpoint.pendingPedestrianCollisions) {
      this.pendingPedestrianCollisions.add(id);
    }
    this.lastPedestrianDelaySettlementTick =
      checkpoint.lastPedestrianDelaySettlementTick;
    this.pedestrianPatienceFrozen = checkpoint.pedestrianPatienceFrozen;
    this.secondaryAdmitCount = checkpoint.secondaryAdmitCount;
    this.pendingTowCharges = checkpoint.pendingTowCharges;
    this.pendingSchoolBusAccidents = checkpoint.pendingSchoolBusAccidents ?? 0;
    this.aggressionCounts = {
      ...(checkpoint.aggressionCounts ?? { redLight: 0, tailgate: 0, cutIn: 0 }),
    };
    this.pendingTailgateLeaders.clear();
    for (const vehicleId of checkpoint.pendingTailgateLeaders ?? []) {
      this.pendingTailgateLeaders.add(vehicleId);
    }
    this.nextScheduledAdmissionOrder = checkpoint.nextScheduledAdmissionOrder;
    this.admissionRevocations = (checkpoint.admissionRevocations ?? []).map(
      (entry) => ({ ...entry, vehicleIds: [...entry.vehicleIds] }),
    );
  }

  getSnapshot(): WorldSnapshot {
    return {
      tick: this.currentTick,
      vehicles: [...this.vehicles.values()]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((vehicle) => ({ ...vehicle })),
      pedestrians: [...this.pedestrians.values()]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((pedestrian) => ({ ...pedestrian })),
      externalPedestrianBacklog: this.externalPedestrianBacklog.map(
        (arrival) => ({ ...arrival }),
      ),
      activeReservationTicks: [...this.reservationTable.keys()].sort(
        (left, right) => left - right,
      ),
      activeLaneGuidancePermits: [...this.laneGuidancePermits.values()].sort(
        (left, right) => left.vehicleId.localeCompare(right.vehicleId),
      ),
      upstreamQueues: [...this.upstreamQueues.entries()]
        .map(([laneId, queue]) => ({
          laneId,
          arrivals: queue.arrivals
            .slice(queue.nextIndex)
            .map((arrival) => ({ ...arrival })),
        }))
        .sort((left, right) => left.laneId.localeCompare(right.laneId)),
    };
  }

  private advanceInboundVehicles(): void {
    for (const laneId of this.network.inboundLanes.keys()) {
      const vehicles = [...this.vehicles.values()]
        .filter(
          (vehicle) =>
            vehicle.inboundLaneId === laneId &&
            isInboundState(vehicle.state),
        )
        .sort((left, right) => right.inboundHeadSlot - left.inboundHeadSlot);
      const lane = this.network.inboundLanes.get(laneId);
      if (lane === undefined) {
        continue;
      }

      const activeBlockingSlots = this.activeInboundBlockingSlots(lane);
      let plannedFrontTail =
        activeBlockingSlots.size === 0
          ? lane.capacitySlots
          : Math.min(...activeBlockingSlots);
      let stalledAhead = false;
      for (const vehicle of vehicles) {
        if (vehicle.state === "STALLED") {
          vehicle.waitingTicks += 1;
          vehicle.encroaching = false;
          stalledAhead = true;
          plannedFrontTail = vehicle.inboundHeadSlot - vehicle.lengthSlots + 1;
          continue;
        }

        const maxHeadSlot = Math.min(
          lane.capacitySlots - 1,
          plannedFrontTail - 1,
        );
        const nextHeadSlot = Math.min(
          vehicle.inboundHeadSlot + 1,
          maxHeadSlot,
        );
        if (vehicle.inboundHeadSlot > maxHeadSlot) {
          vehicle.inboundHeadSlot = Math.max(
            vehicle.lengthSlots - 1,
            maxHeadSlot,
          );
          vehicle.waitingTicks += 1;
          vehicle.startupLagRemaining = this.dynamics.startupLagTicks;
          vehicle.stallBlockedTicks = 0;
          vehicle.state = "QUEUED";
          vehicle.encroaching = false;
          plannedFrontTail =
            vehicle.inboundHeadSlot - vehicle.lengthSlots + 1;
          continue;
        }
        const gapOpened = nextHeadSlot > vehicle.inboundHeadSlot;
        const convoyFlowing = vehicle.scheduledEnterTick !== undefined;
        const distanceToStopline =
          lane.capacitySlots - 1 - vehicle.inboundHeadSlot;
        const pacingScheduledEntry =
          vehicle.scheduledEnterTick !== undefined &&
          this.currentTick + distanceToStopline <
            vehicle.scheduledEnterTick;

        if (gapOpened && pacingScheduledEntry) {
          vehicle.waitingTicks += 1;
          vehicle.state = "QUEUED";
          vehicle.encroaching = false;
        } else if (
          gapOpened &&
          vehicle.startupLagRemaining > 0 &&
          !convoyFlowing
        ) {
          vehicle.startupLagRemaining -= 1;
          vehicle.waitingTicks += 1;
          vehicle.state =
            vehicle.inboundHeadSlot === lane.capacitySlots - 1
              ? "AT_STOPLINE"
              : "QUEUED";
        } else if (gapOpened) {
          vehicle.inboundHeadSlot = nextHeadSlot;
          vehicle.startupLagRemaining = 0;
          vehicle.stallBlockedTicks = 0;
          vehicle.state =
            nextHeadSlot === lane.capacitySlots - 1
              ? "AT_STOPLINE"
              : "APPROACHING";
        } else {
          vehicle.waitingTicks += 1;
          vehicle.startupLagRemaining = this.dynamics.startupLagTicks;
          vehicle.stallBlockedTicks = stalledAhead
            ? vehicle.stallBlockedTicks + 1
            : 0;
          vehicle.state =
            vehicle.inboundHeadSlot === lane.capacitySlots - 1
              ? "AT_STOPLINE"
              : "QUEUED";
        }

        if (vehicle.state === "AT_STOPLINE") {
          this.maybeStall(vehicle);
        }
        if (
          vehicle.state === "AT_STOPLINE" &&
          vehicle.waitingTicks >= this.dynamics.creepAfterWaitingTicks
        ) {
          vehicle.encroaching = true;
        } else if (vehicle.state !== "AT_STOPLINE") {
          vehicle.encroaching = false;
        }
        plannedFrontTail = vehicle.inboundHeadSlot - vehicle.lengthSlots + 1;
      }
    }
  }

  private activeInboundBlockingSlots(lane: Lane): Set<number> {
    const occupied = new Set<number>();
    for (const vehicle of this.vehicles.values()) {
      if (
        vehicle.inboundLaneId !== lane.id ||
        (vehicle.state !== "ACCIDENT_STOPPED" &&
          vehicle.state !== "EVACUATING")
      ) {
        continue;
      }
      const trajectory = this.network.trajectories.get(vehicle.routeId);
      if (trajectory === undefined) {
        continue;
      }
      for (let offset = 0; offset < vehicle.lengthSlots; offset += 1) {
        const trajectoryIndex = vehicle.trajectoryHeadSlot - offset;
        if (trajectoryIndex < 0) {
          const inboundIndex = lane.capacitySlots + trajectoryIndex;
          if (inboundIndex >= 0 && inboundIndex < lane.capacitySlots) {
            occupied.add(inboundIndex);
          }
          continue;
        }
        const slot = trajectory.slots[trajectoryIndex];
        if (slot === undefined) {
          continue;
        }
        const inboundIndex = this.inboundSlotIndexAtPoint(
          lane,
          slot.x,
          slot.y,
        );
        if (inboundIndex !== undefined) {
          occupied.add(inboundIndex);
        }
      }
    }
    return occupied;
  }

  private inboundSlotIndexAtPoint(
    lane: Lane,
    x: number,
    y: number,
  ): number | undefined {
    const travel =
      lane.direction === "NORTH"
        ? { x: 0, y: 1 }
        : lane.direction === "EAST"
          ? { x: -1, y: 0 }
          : lane.direction === "SOUTH"
            ? { x: 0, y: -1 }
            : { x: 1, y: 0 };
    const dx = x - lane.anchor.x;
    const dy = y - lane.anchor.y;
    const steps = dx * travel.x + dy * travel.y;
    const lateral = dx * -travel.y + dy * travel.x;
    if (
      Math.abs(lateral) > 1e-6 ||
      steps > 1e-6 ||
      Math.abs(steps - Math.round(steps)) > 1e-6
    ) {
      return undefined;
    }
    const index = lane.capacitySlots - 1 + Math.round(steps);
    return index >= 0 && index < lane.capacitySlots ? index : undefined;
  }

  private advanceActiveVehicles(): VehicleDespawnEvent[] {
    const events: VehicleDespawnEvent[] = [];
    const outboundAtStart = new Set(
      [...this.vehicles.values()]
        .filter((vehicle) => vehicle.state === "OUTBOUND")
        .map((vehicle) => vehicle.id),
    );

    for (const vehicle of this.vehicles.values()) {
      if (vehicle.state === "ACCIDENT_STOPPED") {
        continue;
      }
      if (vehicle.state === "EVACUATING") {
        continue;
      }
      if (vehicle.state === "CROSSING") {
        this.advanceProfiledVehicle(vehicle);
        continue;
      }
      if (vehicle.state === "EXIT_BLOCKED") {
        this.advanceProfiledVehicle(vehicle);
      }
    }

    this.advanceOutboundVehicles(outboundAtStart, events);
    for (const event of events) {
      this.vehicles.delete(event.vehicleId);
    }
    return events;
  }

  private advanceOutboundVehicles(
    outboundAtStart: ReadonlySet<VehicleId>,
    events: VehicleDespawnEvent[],
  ): void {
    for (const [laneId, lane] of this.network.outboundLanes) {
      const held = this.exitHoldActive(laneId);
      const vehicles = [...this.vehicles.values()]
        .filter(
          (vehicle) =>
            outboundAtStart.has(vehicle.id) &&
            vehicle.outboundLaneId === laneId &&
            vehicle.state === "OUTBOUND",
        )
        .sort((left, right) => right.outboundHeadSlot - left.outboundHeadSlot);
      let plannedFrontTail = Number.POSITIVE_INFINITY;
      for (const vehicle of vehicles) {
        const nextHead = vehicle.outboundHeadSlot + 1;
        if (nextHead > plannedFrontTail - 1) {
          plannedFrontTail = vehicle.outboundHeadSlot - vehicle.lengthSlots + 1;
          continue;
        }
        const nextTail = nextHead - vehicle.lengthSlots + 1;
        if (nextTail >= lane.capacitySlots) {
          if (held) {
            plannedFrontTail =
              vehicle.outboundHeadSlot - vehicle.lengthSlots + 1;
            continue;
          }
          vehicle.outboundHeadSlot = nextHead;
          vehicle.state = "DESPAWNED";
          vehicle.despawnedAtTick = this.currentTick + 1;
          events.push({
            vehicleId: vehicle.id,
            vehicleType: vehicle.type,
            totalTravelTicks: this.currentTick + 1 - vehicle.generatedAtTick,
            tick: this.currentTick + 1,
            ...(vehicle.violation === undefined ? {} : { violation: vehicle.violation }),
          });
          plannedFrontTail = Number.POSITIVE_INFINITY;
          continue;
        }
        vehicle.outboundHeadSlot = nextHead;
        plannedFrontTail = nextTail;
      }
    }
  }

  private stoplineCandidates(): Vehicle[] {
    const headIds = new Set(this.laneHeadVehicleIds().values());
    return [...this.vehicles.values()]
      .filter(
        (vehicle) =>
          vehicle.state === "AT_STOPLINE" &&
          vehicle.scheduledEnterTick === undefined &&
          headIds.has(vehicle.id),
      )
      .sort((left, right) => left.inboundLaneId.localeCompare(right.inboundLaneId));
  }

  private dischargingLanes() {
    const byLane = new Map<LaneId, Vehicle[]>();
    for (const vehicle of this.vehicles.values()) {
      if (vehicle.scheduledEnterTick === undefined) {
        continue;
      }
      const vehicles = byLane.get(vehicle.inboundLaneId) ?? [];
      vehicles.push(vehicle);
      byLane.set(vehicle.inboundLaneId, vehicles);
    }
    return [...byLane.entries()]
      .map(([laneId, vehicles]) => {
        const enterTicks = vehicles
          .map((vehicle) => vehicle.scheduledEnterTick)
          .filter((tick): tick is number => tick !== undefined);
        const estimatedClearTick = vehicles.reduce((latest, vehicle) => {
          const trajectory = this.network.trajectories.get(vehicle.routeId);
          const enterTick = vehicle.scheduledEnterTick ?? this.currentTick;
          const timeline =
            trajectory === undefined
              ? []
              : vehicleOccupationTimeline(
                  vehicle,
                  trajectory.slots,
                  this.dynamics.slowStartSteps,
                );
          const duration = (timeline.at(-1)?.tickOffset ?? 0) + 1;
          return Math.max(
            latest,
            enterTick + duration,
          );
        }, this.currentTick);
        return {
          laneId,
          remainingVehicles: vehicles.length,
          nextEnterTick: Math.min(...enterTicks),
          estimatedClearTick,
        };
      })
      .sort((left, right) => left.laneId.localeCompare(right.laneId));
  }

  private laneHeadVehicleIds(): Map<LaneId, VehicleId> {
    const heads = new Map<LaneId, VehicleId>();
    for (const laneId of this.network.inboundLanes.keys()) {
      const head = [...this.vehicles.values()]
        .filter(
          (vehicle) =>
            vehicle.inboundLaneId === laneId &&
            isInboundState(vehicle.state),
        )
        .sort((left, right) => right.inboundHeadSlot - left.inboundHeadSlot)[0];
      if (head !== undefined) {
        heads.set(laneId, head.id);
      }
    }
    return heads;
  }

  private hasSpawnCapacity(laneId: LaneId, lengthSlots: number): boolean {
    const lane = this.network.inboundLanes.get(laneId);
    if (lane === undefined) {
      return false;
    }
    const occupied = this.activeInboundBlockingSlots(lane);
    for (const vehicle of this.vehicles.values()) {
      if (
        vehicle.inboundLaneId !== laneId ||
        !isInboundState(vehicle.state)
      ) {
        continue;
      }
      for (let offset = 0; offset < vehicle.lengthSlots; offset += 1) {
        occupied.add(vehicle.inboundHeadSlot - offset);
      }
    }
    for (let slot = 0; slot < lengthSlots; slot += 1) {
      if (occupied.has(slot)) {
        return false;
      }
    }
    return true;
  }

  get scheduledCollisionCount(): number {
    return this.pendingCollisions.length;
  }

  lockedResourceCount(): number {
    return this.lockedResources.size;
  }

  hazardResourceUnits(): number {
    const units = new Map<ConflictResourceId, number>();
    for (const incident of this.incidents) {
      if (incident.status !== "OPEN") {
        continue;
      }
      const hazmat = incident.vehicleIds.some((vehicleId) => {
        const vehicle = this.vehicles.get(vehicleId);
        return vehicle !== undefined && riskTagFor(vehicle.type) === "HAZMAT";
      });
      const multiplier =
        this.incidentHazardMultiplier(incident.severity) *
        (hazmat ? this.dynamics.hazmatHazardMultiplier : 1);
      for (const resourceId of incident.lockedResourceIds) {
        units.set(resourceId, Math.max(units.get(resourceId) ?? 0, multiplier));
      }
    }
    return [...units.values()].reduce((sum, value) => sum + value, 0);
  }

  exitLockedResourceCount(): number {
    return this.exitBlockedResources.size;
  }

  waitingCharges(normalDelayPerTick: number): WaitingCharges {
    return this.collectWaitingSettlement(normalDelayPerTick).totals;
  }

  vehicleWaitingCharges(normalDelayPerTick: number): VehicleWaitingCharge[] {
    return [...this.collectWaitingSettlement(normalDelayPerTick).vehicles];
  }

  terminalSettlement(
    toll: (vehicle: Vehicle) => number,
    unservedLiability: number,
  ): TerminalSettlement {
    let outboundToll = 0;
    let crossingToll = 0;
    let unservedOnMap = 0;
    let unservedPassengers = 0;
    for (const vehicle of this.vehicles.values()) {
      if (vehicle.state === "OUTBOUND") {
        outboundToll += violationForfeitsToll(vehicle.violation) ? 0 : toll(vehicle);
      } else if (
        vehicle.state === "CROSSING" ||
        vehicle.state === "EXIT_BLOCKED" ||
        vehicle.state === "EVACUATING"
      ) {
        if (violationForfeitsToll(vehicle.violation)) {
          continue;
        }
        const slots = this.network.trajectories.get(vehicle.routeId)?.slots.length ?? 0;
        const progress =
          slots === 0
            ? 0
            : Math.min(1, Math.max(0, (vehicle.trajectoryHeadSlot + 1) / slots));
        crossingToll += toll(vehicle) * progress;
      } else if (isInboundState(vehicle.state)) {
        unservedOnMap += 1;
        unservedPassengers += passengersFor(vehicle.type);
      }
    }
    const unservedUpstream = this.upstreamBacklogCount();
    unservedPassengers += this.upstreamBacklogPassengers();
    return {
      outboundToll,
      crossingToll,
      unservedOnMap,
      unservedUpstream,
      unservedPassengers,
      unservedLiability: unservedPassengers * unservedLiability,
    };
  }

  upstreamBacklogCount(): number {
    let count = 0;
    for (const queue of this.upstreamQueues.values()) {
      count += queue.arrivals.length - queue.nextIndex;
    }
    return count;
  }

  upstreamBacklogPassengers(): number {
    let passengers = 0;
    for (const queue of this.upstreamQueues.values()) {
      for (let index = queue.nextIndex; index < queue.arrivals.length; index += 1) {
        const arrival = queue.arrivals[index];
        passengers += arrival === undefined ? 0 : passengersFor(arrival.type);
      }
    }
    return passengers;
  }

  collectWaitingSettlement(
    normalDelayPerTick: number,
    upstreamPerTick = 0,
  ): WaitingSettlement {
    let delay = 0;
    let emergency = 0;
    let stallChain = 0;
    const charges: VehicleWaitingCharge[] = [];
    for (const vehicle of this.vehicles.values()) {
      const part = this.classifiedWaitingCharge(vehicle, normalDelayPerTick);
      delay += part.delay;
      emergency += part.emergency;
      stallChain += part.stallChain;
      const amount = part.delay + part.emergency + part.stallChain;
      if (amount > 0) {
        charges.push({ vehicleId: vehicle.id, amount });
      }
    }
    return {
      totals: {
        delay,
        emergency,
        stallChain,
        upstream: this.upstreamBacklogPassengers() * upstreamPerTick,
      },
      vehicles: charges,
    };
  }

  private classifiedWaitingCharge(
    vehicle: Vehicle,
    normalDelayPerTick: number,
  ): { delay: number; emergency: number; stallChain: number } {
    const distanceToStopline = this.distanceToStopline(vehicle);
    const inbound = isInboundState(vehicle.state);
    const insideDelayHorizon =
      inbound && distanceToStopline <= DELAY_CHARGE_HORIZON_SLOTS;
    const stationary =
      vehicle.stationaryTicks >= this.dynamics.waitingChargeGraceTicks;
    const waitingState = isChargeableWaitingState(vehicle.state);
    const emergencyInsideAlertHorizon =
      vehicleClass(vehicle.type) === "emergency" &&
      distanceToStopline <= EMERGENCY_ALERT_HORIZON_SLOTS;
    let delay = 0;
    let emergency = 0;
    if (insideDelayHorizon && stationary && emergencyInsideAlertHorizon) {
      emergency = this.dynamics.emergencyDelayBleedPerTick;
    } else if (inbound && stationary && waitingState) {
      delay = normalDelayPerTick * passengersFor(vehicle.type);
    }
    const stallChain =
      insideDelayHorizon &&
      waitingState &&
      vehicle.stallBlockedTicks > this.dynamics.stallChainAfterTicks
        ? this.dynamics.stallChainStep *
          (vehicle.stallBlockedTicks - this.dynamics.stallChainAfterTicks)
        : 0;
    return { delay, emergency, stallChain };
  }

  dispatchEmergencyConvoy(
    laneId: LaneId,
    emergencyVehicleId: VehicleId,
    clearingRouteId?: RouteId,
  ): ConvoyResult {
    const emergency = this.vehicles.get(emergencyVehicleId);
    if (
      emergency === undefined ||
      emergency.inboundLaneId !== laneId ||
      !isInboundState(emergency.state) ||
      vehicleClass(emergency.type) !== "emergency"
    ) {
      return { ok: false, error: "UNKNOWN_EMERGENCY" };
    }
    const ahead = this.inboundVehiclesForLane(laneId).filter(
      (vehicle) => vehicle.inboundHeadSlot > emergency.inboundHeadSlot,
    );
    if (ahead.some((vehicle) => vehicle.state === "STALLED")) {
      return { ok: false, error: "STALLED_BLOCKER" };
    }
    const convoy = [...ahead, emergency];
    const headId = this.laneHeadVehicleIds().get(laneId);
    const front = convoy[0];
    if (front === undefined || front.id !== headId || front.state !== "AT_STOPLINE") {
      return { ok: false, error: "NOT_LANE_HEAD" };
    }

    const saved = ahead.map((vehicle): SavedInboundVehicleState => ({
      vehicle,
      routeId: vehicle.routeId,
      inboundLaneId: vehicle.inboundLaneId,
      outboundLaneId: vehicle.outboundLaneId,
      state: vehicle.state,
      startupLagRemaining: vehicle.startupLagRemaining,
      stallBlockedTicks: vehicle.stallBlockedTicks,
      stationaryTicks: vehicle.stationaryTicks,
      encroaching: vehicle.encroaching,
      ...(vehicle.scheduledEnterTick === undefined
        ? {}
        : { scheduledEnterTick: vehicle.scheduledEnterTick }),
      ...(vehicle.admissionState === undefined
        ? {}
        : { admissionState: vehicle.admissionState }),
      ...(vehicle.scheduledAdmissionOrder === undefined
        ? {}
        : { scheduledAdmissionOrder: vehicle.scheduledAdmissionOrder }),
      ...(vehicle.scheduledBatchId === undefined
        ? {}
        : { scheduledBatchId: vehicle.scheduledBatchId }),
      ...(vehicle.scheduledSlideTicks === undefined
        ? {}
        : { scheduledSlideTicks: vehicle.scheduledSlideTicks }),
    }));
    const savedReservations = cloneReservationTable(this.reservationTable);
    const savedPendingCollisions = [...this.pendingCollisions];
    const savedPermits = new Map(this.laneGuidancePermits);
    let targetLaneId: LaneId | undefined;
    if (clearingRouteId !== undefined) {
      const clearing = this.resolveTrajectory(clearingRouteId);
      const movers = ahead.length === 0 ? [emergency] : ahead;
      const validTargetRouteIds = this.validInboundTransferTargets(
        emergency.routeId,
        movers,
      );
      if (clearing === undefined) {
        return {
          ok: false,
          error: "INVALID_CLEARING_ROUTE",
          validTargetRouteIds,
        };
      }
      const validation = this.validateInboundTransfer(movers, clearing);
      if (!validation.ok) {
        return {
          ok: false,
          error: validation.error,
          detail: validation.detail,
          validTargetRouteIds: validation.validTargetRouteIds,
          ...(validation.blockingVehicleId === undefined
            ? {}
            : { blockingVehicleId: validation.blockingVehicleId }),
          ...(validation.blockedSlot === undefined
            ? {}
            : { blockedSlot: validation.blockedSlot }),
        };
      }
      if (ahead.length > 0) {
        this.applyInboundTransfer(validation.plan);
      }
      targetLaneId = clearing.inboundLaneId;
    }

    const convoyIds = new Set(convoy.map((vehicle) => vehicle.id));
    const probe = cloneReservationTable(this.reservationTable);
    paintOccupations(
      probe,
      this.creepOccupations(convoyIds),
      this.currentTick,
      RESERVATION_PROBE_HORIZON,
    );
    const clean = cloneReservationTable(this.reservationTable);
    let enterTick = this.currentTick;
    const plan: Array<{ vehicle: Vehicle; tick: number }> = [];
    for (const vehicle of convoy) {
      const trajectory = this.network.trajectories.get(vehicle.routeId);
      if (trajectory === undefined) {
        this.restoreInboundTransfer(
          saved,
          savedReservations,
          savedPendingCollisions,
          savedPermits,
        );
        return { ok: false, error: "UNKNOWN_ROUTE" };
      }
      if (trajectory.inboundLaneId !== vehicle.inboundLaneId) {
        this.restoreInboundTransfer(
          saved,
          savedReservations,
          savedPendingCollisions,
          savedPermits,
        );
        return { ok: false, error: "LANE_ROUTE_MISMATCH" };
      }
      let conflict = this.probeCrossing(
        vehicle,
        trajectory.slots,
        enterTick,
        probe,
      );
      while (
        (conflict?.error === "RESOURCE_CONFLICT" ||
          conflict?.error === "CROSSWALK") &&
        enterTick < this.currentTick + RESERVATION_PROBE_HORIZON
      ) {
        enterTick += 1;
        conflict = this.probeCrossing(
          vehicle,
          trajectory.slots,
          enterTick,
          probe,
        );
      }
      if (conflict !== undefined) {
        this.restoreInboundTransfer(
          saved,
          savedReservations,
          savedPendingCollisions,
          savedPermits,
        );
        return {
          ok: false,
          error: conflict.error,
          ...(conflict.conflictingVehicleId === undefined
            ? {}
            : { conflictingVehicleId: conflict.conflictingVehicleId }),
          ...(conflict.conflictingResourceId === undefined
            ? {}
            : { conflictingResourceId: conflict.conflictingResourceId }),
        };
      }
      writeVehicleReservation(
        vehicle,
        trajectory.slots,
        enterTick,
        probe,
        this.dynamics.slowStartSteps,
      );
      writeVehicleReservation(
        vehicle,
        trajectory.slots,
        enterTick,
        clean,
        this.dynamics.slowStartSteps,
      );
      plan.push({ vehicle, tick: enterTick });
      enterTick += 1;
    }

    this.reservationTable = clean;
    for (const item of plan) {
      if (item.tick <= this.currentTick) {
        this.enterCrossing(item.vehicle);
        continue;
      }
      item.vehicle.scheduledEnterTick = item.tick;
      item.vehicle.startupLagRemaining = 0;
    }
    if (targetLaneId !== undefined) {
      this.revokeLaneSchedules(targetLaneId, "LANE_TRANSFER", convoyIds);
    }
    this.incidentLog.push({
      kind: "CONVOY",
      tick: this.currentTick,
      laneId,
      vehicleIds: plan.map((item) => item.vehicle.id),
      ...(clearingRouteId === undefined ? {} : { routeId: clearingRouteId }),
    });
    return {
      ok: true,
      admittedVehicleIds: plan.map((item) => item.vehicle.id),
      ...(targetLaneId === undefined ? {} : { targetLaneId }),
    };
  }

  rerouteQueueAroundStall(
    stalledVehicleId: VehicleId,
    targetLaneId: string,
    vehiclesToDivert = 1,
  ): StallRerouteResult {
    const stalled = this.vehicles.get(stalledVehicleId);
    if (stalled === undefined || stalled.state !== "STALLED") {
      return { ok: false, error: "UNKNOWN_STALL" };
    }
    const target = this.resolveTrajectory(targetLaneId);
    const count = Math.max(0, Math.trunc(vehiclesToDivert));
    const followers = this.inboundVehiclesForLane(stalled.inboundLaneId)
      .filter((vehicle) => vehicle.inboundHeadSlot < stalled.inboundHeadSlot)
      .slice(0, count);
    const bypassLaneIds = this.validInboundTransferTargets(
      stalled.routeId,
      followers,
    ).map((routeId) => this.network.trajectories.get(routeId)?.inboundLaneId);
    if (target === undefined || !bypassLaneIds.includes(target.inboundLaneId)) {
      return { ok: false, error: "INVALID_BYPASS_LANE" };
    }
    const validation = this.validateInboundTransfer(followers, target);
    if (!validation.ok) {
      return {
        ok: false,
        error: validation.error,
        detail: validation.detail,
      };
    }
    this.applyInboundTransfer(validation.plan);
    this.revokeLaneSchedules(target.inboundLaneId, "LANE_TRANSFER");
    const targetRouteId =
      this.laneNativeRouteId(target.inboundLaneId) ?? target.id;
    this.incidentLog.push({
      kind: "STALL_REROUTE",
      tick: this.currentTick,
      vehicleId: stalled.id,
      laneId: target.inboundLaneId,
      routeId: targetRouteId,
      vehicleIds: followers.map((vehicle) => vehicle.id),
      transfers: transferRecords(validation.plan),
    });
    return { ok: true, movedVehicleIds: followers.map((vehicle) => vehicle.id) };
  }

  consumeSecondaryAdmitCount(): number {
    const count = this.secondaryAdmitCount;
    this.secondaryAdmitCount = 0;
    return count;
  }

  dispatchTowTruck(
    vehicleId: VehicleId,
    clearanceTicks: number,
    cost: number,
  ): TowDispatchResult {
    const vehicle = this.vehicles.get(vehicleId);
    if (vehicle === undefined) {
      return { ok: false, error: "UNKNOWN_VEHICLE" };
    }
    if (vehicle.state !== "STALLED") {
      return { ok: false, error: "VEHICLE_NOT_STALLED" };
    }
    if (this.towTasks.has(vehicleId)) {
      return { ok: false, error: "TOW_ALREADY_DISPATCHED" };
    }
    const task: TowTask = {
      vehicleId,
      completionTick: this.currentTick + Math.max(1, Math.trunc(clearanceTicks)),
      cost: Math.max(0, cost),
    };
    this.towTasks.set(vehicleId, task);
    this.pendingTowCharges += task.cost;
    this.incidentLog.push({
      kind: "TOW_DISPATCH",
      tick: this.currentTick,
      vehicleId,
      laneId: vehicle.inboundLaneId,
      routeId: vehicle.routeId,
      completionTick: task.completionTick,
      cost: task.cost,
    });
    return {
      ok: true,
      vehicleId,
      completionTick: task.completionTick,
      cost: task.cost,
    };
  }

  consumeTowCharges(): number {
    const charges = this.pendingTowCharges;
    this.pendingTowCharges = 0;
    return charges;
  }

  aggressionSummary(): AggressionCounts {
    return { ...this.aggressionCounts };
  }

  consumeSchoolBusAccidents(): number {
    const count = this.pendingSchoolBusAccidents;
    this.pendingSchoolBusAccidents = 0;
    return count;
  }

  private noteRiskAccident(vehicle: Vehicle): void {
    if (riskTagFor(vehicle.type) === "SCHOOL_BUS") {
      this.pendingSchoolBusAccidents += 1;
    }
  }

  drainIncidentLog(): IncidentLogEntry[] {
    const entries = this.incidentLog;
    this.incidentLog = [];
    return entries;
  }

  drainPedestrianEvents(): PedestrianEvent[] {
    const events = this.pedestrianEvents;
    this.pedestrianEvents = [];
    return events;
  }

  collectPedestrianSettlement(
    rates: PedestrianEconomyRates,
  ): PedestrianSettlement {
    const chargeDelay =
      this.lastPedestrianDelaySettlementTick !== this.currentTick;
    const waitingPedestrians = chargeDelay
      ? [...this.pedestrians.values()].filter(
          (pedestrian) =>
            pedestrian.state === "WAITING" &&
            pedestrian.waitingTicks > rates.waitingGraceTicks,
        ).length +
        this.externalPedestrianBacklog.filter(
          (arrival) =>
            this.currentTick - arrival.tick > rates.waitingGraceTicks,
        ).length
      : 0;
    if (chargeDelay) {
      this.lastPedestrianDelaySettlementTick = this.currentTick;
    }
    const completedPedestrians = this.pendingPedestrianCompletions.size;
    const jaywalkWaves = this.pendingJaywalkWaves.size;
    const firstJaywalks = this.pendingFirstJaywalks.size;
    const collisionInjuries = this.pendingPedestrianCollisions.size;
    this.pendingPedestrianCompletions.clear();
    this.pendingJaywalkWaves.clear();
    this.pendingFirstJaywalks.clear();
    this.pendingPedestrianCollisions.clear();
    return {
      waitingPedestrians,
      completedPedestrians,
      jaywalkWaves,
      firstJaywalks,
      collisionInjuries,
      delayCost: waitingPedestrians * rates.delayPerTick,
      completionRevenue:
        completedPedestrians * rates.completionReward,
      jaywalkCost:
        jaywalkWaves * rates.jaywalkWavePenalty +
        firstJaywalks * rates.jaywalkerPenalty,
      collisionCost:
        collisionInjuries * rates.collisionPenalty,
    };
  }

  incidentSummaries(): IncidentSummary[] {
    return this.incidents.map((incident) => this.summarizeIncident(incident));
  }

  inspectIncident(incidentId: string): IncidentSummary | undefined {
    const incident = this.incidents.find((item) => item.id === incidentId);
    return incident === undefined
      ? undefined
      : this.summarizeIncident(incident);
  }

  orderAccidentClearance(
    incidentId: string,
    targetEvacLane: LaneId,
  ): IncidentActionResult {
    const incident = this.incidents.find((item) => item.id === incidentId);
    if (incident === undefined) {
      return { ok: false, error: "UNKNOWN_INCIDENT" };
    }
    if (incident.status !== "OPEN") {
      return { ok: false, error: "INCIDENT_CLOSED" };
    }
    const suggested = this.suggestedEvacLanes(
      incident.lockedResourceIds,
      incident.vehicleIds,
    );
    if (
      incident.targetEvacLane !== targetEvacLane &&
      !suggested.includes(targetEvacLane)
    ) {
      return {
        ok: false,
        error: "UNKNOWN_EVAC_LANE",
        suggestedEvacLanes: suggested,
      };
    }

    const firstOrder = incident.clearanceReadyTick === undefined;
    const previousTarget = incident.targetEvacLane;
    const targetChanged =
      previousTarget !== undefined && previousTarget !== targetEvacLane;
    const started: VehicleId[] = [];
    incident.targetEvacLane = targetEvacLane;
    if (firstOrder) {
      incident.clearanceReadyTick =
        this.currentTick + this.incidentPreparationTicks(incident);
    }
    for (const vehicleId of incident.vehicleIds) {
      const vehicle = this.vehicles.get(vehicleId);
      if (vehicle === undefined || vehicle.state !== "ACCIDENT_STOPPED") {
        continue;
      }
      if (firstOrder) {
        started.push(vehicle.id);
      }
    }
    // Injured pedestrians remain at the impact pose until the clearance crew
    // is ready. Removing them on the command tick made the replay skip the fall.
    const removedPedestrianIds: PedestrianId[] = [];
    const noOp = !targetChanged && !firstOrder && started.length === 0;
    if (!noOp) {
      this.incidentLog.push({
        kind: "EVACUATION",
        tick: this.currentTick,
        incidentId: incident.id,
        targetEvacLane,
        vehicleIds: started,
        pedestrianIds: removedPedestrianIds,
        collisionType: incident.collisionType,
        severity: incident.severity,
        estimatedClearanceTicks: this.estimatedIncidentClearanceTicks(incident),
      });
    }
    return {
      ok: true,
      detail: noOp
        ? `Clearance already active toward ${targetEvacLane}`
        : `Clearance ready at tick ${incident.clearanceReadyTick}`,
      startedVehicleIds: started,
      noOp,
      currentTargetEvacLane: targetEvacLane,
      targetChanged,
    };
  }

  setLaneDetour(
    severedLaneId: string,
    action:
      | "HOLD_AT_STOPLINE"
      | "RELEASE_AT_STOPLINE"
      | "DIVERT_TO_ADJACENT_LANE",
    targetAdjacentLane?: string,
  ): IncidentActionResult {
    const source = this.resolveRoute(severedLaneId);
    if (source === undefined) {
      return { ok: false, error: "UNKNOWN_LANE" };
    }
    if (action === "RELEASE_AT_STOPLINE") {
      const hold = this.heldInboundLanes.get(source.inboundLaneId);
      if (hold === undefined) {
        return { ok: false, error: "LANE_NOT_HELD" };
      }
      this.heldInboundLanes.delete(source.inboundLaneId);
      this.incidentLog.push({
        kind: "LANE_DETOUR",
        tick: this.currentTick,
        incidentId: hold.incidentId,
        action,
        laneId: hold.laneId,
        routeId: hold.routeId,
      });
      return {
        ok: true,
        incidentId: hold.incidentId,
        laneId: hold.laneId,
        routeId: hold.routeId,
        holdState: "RELEASED",
      };
    }
    if (!this.severedRouteIds().includes(source.id)) {
      return { ok: false, error: "SOURCE_NOT_SEVERED" };
    }
    if (action === "HOLD_AT_STOPLINE") {
      const incident = this.openIncidentSevering(source);
      if (incident === undefined) {
        return { ok: false, error: "INCIDENT_NOT_FOUND" };
      }
      const hold: ActiveLaneHold = {
        laneId: source.inboundLaneId,
        routeId: source.id,
        incidentId: incident.id,
        sinceTick: this.currentTick,
      };
      this.heldInboundLanes.set(source.inboundLaneId, hold);
      this.incidentLog.push({
        kind: "LANE_DETOUR",
        tick: this.currentTick,
        incidentId: incident.id,
        action,
        laneId: source.inboundLaneId,
        routeId: source.id,
      });
      return {
        ok: true,
        incidentId: incident.id,
        laneId: source.inboundLaneId,
        routeId: source.id,
        holdState: "HELD",
      };
    }

    if (targetAdjacentLane === undefined || targetAdjacentLane.length === 0) {
      return {
        ok: false,
        error: "TARGET_REQUIRED",
        validTargetRouteIds: this.validInboundTransferTargets(source.id),
      };
    }
    const target = this.resolveRoute(targetAdjacentLane);
    if (target === undefined) {
      return {
        ok: false,
        error: "UNKNOWN_ROUTE",
        validTargetRouteIds: this.validInboundTransferTargets(source.id),
      };
    }
    const headId = this.laneHeadVehicleIds().get(source.inboundLaneId);
    const vehicle = headId === undefined ? undefined : this.vehicles.get(headId);
    if (vehicle === undefined || !isInboundState(vehicle.state)) {
      return { ok: false, error: "NO_INBOUND_HEAD" };
    }
    if (vehicle.state === "STALLED") {
      return { ok: false, error: "STALLED_HEAD" };
    }
    const validation = this.validateInboundTransfer([vehicle], target);
    if (!validation.ok) {
      return {
        ok: false,
        error: validation.error,
        detail: validation.detail,
        validTargetRouteIds: validation.validTargetRouteIds,
        ...(validation.blockingVehicleId === undefined
          ? {}
          : { blockingVehicleId: validation.blockingVehicleId }),
        ...(validation.blockedSlot === undefined
          ? {}
          : { blockedSlot: validation.blockedSlot }),
      };
    }
    this.applyInboundTransfer(validation.plan);
    this.revokeLaneSchedules(target.inboundLaneId, "LANE_TRANSFER");
    this.incidentLog.push({
      kind: "LANE_DETOUR",
      tick: this.currentTick,
      action,
      laneId: source.inboundLaneId,
      targetRouteId: target.id,
      vehicleId: vehicle.id,
      routeId: vehicle.routeId,
      transfers: transferRecords(validation.plan),
    });
    return {
      ok: true,
      vehicleId: vehicle.id,
      routeId: vehicle.routeId,
      targetLaneId: target.inboundLaneId,
    };
  }

  private advanceAlongTrajectory(vehicle: Vehicle): void {
    const trajectory = this.network.trajectories.get(vehicle.routeId);
    if (trajectory === undefined) {
      throw new Error(`Vehicle ${vehicle.id} has unknown route`);
    }
    const nextHead = vehicle.trajectoryHeadSlot + 1;
    const nextTail = nextHead - vehicle.lengthSlots + 1;
    if (nextTail >= trajectory.slots.length) {
      if (!this.outboundEntranceFree(vehicle.outboundLaneId, vehicle.lengthSlots)) {
        vehicle.state = "EXIT_BLOCKED";
        return;
      }
      vehicle.trajectoryHeadSlot = nextHead;
      vehicle.state = "OUTBOUND";
      vehicle.outboundHeadSlot = nextHead - trajectory.slots.length;
      return;
    }
    vehicle.trajectoryHeadSlot = nextHead;
    if (vehicle.state === "EXIT_BLOCKED") {
      vehicle.state = "CROSSING";
    }
  }

  private advanceProfiledVehicle(vehicle: Vehicle): void {
    const trajectory = this.network.trajectories.get(vehicle.routeId);
    if (trajectory === undefined) {
      throw new Error(`Vehicle ${vehicle.id} has unknown route`);
    }
    const motion = previewVehicleMotion(
      vehicle,
      trajectory.maneuver,
      this.dynamics.slowStartSteps,
    );
    const displacement = this.allowedTrajectoryDisplacement(
      vehicle,
      motion.displacement,
    );
    commitVehicleMotion(vehicle, motion);
    for (let step = 0; step < displacement; step += 1) {
      this.advanceAlongTrajectory(vehicle);
    }
    if (
      displacement < motion.displacement &&
      vehicle.state !== "OUTBOUND" &&
      vehicle.trajectoryHeadSlot - vehicle.lengthSlots + 2 >=
        trajectory.slots.length
    ) {
      vehicle.state = "EXIT_BLOCKED";
    }
  }

  private allowedTrajectoryDisplacement(
    vehicle: Vehicle,
    requestedDisplacement: number,
  ): number {
    const trajectory = this.network.trajectories.get(vehicle.routeId);
    if (trajectory === undefined) {
      return 0;
    }
    let allowed = 0;
    for (let step = 1; step <= requestedDisplacement; step += 1) {
      const nextHead = vehicle.trajectoryHeadSlot + step;
      const nextTail = nextHead - vehicle.lengthSlots + 1;
      if (nextTail < trajectory.slots.length) {
        allowed = step;
        continue;
      }
      if (
        nextTail > trajectory.slots.length ||
        !this.outboundEntranceFree(
          vehicle.outboundLaneId,
          vehicle.lengthSlots,
        )
      ) {
        break;
      }
      allowed = step;
    }
    return allowed;
  }

  private activateDueAccidents(): string | undefined {
    const due = this.pendingCollisions.filter(
      (collision) =>
        collision.tick <= this.currentTick &&
        !this.activatedCollisionKeys.has(this.collisionKey(collision)),
    );
    if (due.length === 0) {
      return undefined;
    }

    const activated: TrackedIncident[] = [];
    for (const collision of due) {
      this.activatedCollisionKeys.add(this.collisionKey(collision));
      activated.push(this.bindCollision(collision));
    }
    this.pendingCollisions = this.pendingCollisions.filter(
      (collision) =>
        !this.activatedCollisionKeys.has(this.collisionKey(collision)),
    );
    this.refreshIncidentLocks();

    const activatedIncidents: TrackedIncident[] = [];
    const seenIncidents = new Set<string>();
    for (const incident of activated) {
      if (seenIncidents.has(incident.id)) {
        continue;
      }
      seenIncidents.add(incident.id);
      activatedIncidents.push(incident);
    }
    const reasons = activatedIncidents.map((incident) =>
      this.formatInterrupt(incident),
    );
    for (const incident of activatedIncidents) {
      const reason = this.formatInterrupt(incident);
      this.incidentLog.push({
        kind: "ACCIDENT",
        tick: this.currentTick,
        incidentId: incident.id,
        vehicleIds: [...incident.vehicleIds],
        pedestrianIds: [...incident.pedestrianIds],
        lockedResourceIds: [...incident.lockedResourceIds],
        collisionType: incident.collisionType,
        severity: incident.severity,
        collisionOutcomes: incident.collisionOutcomes.filter(
          (outcome) => outcome.impactTick === this.currentTick,
        ),
        estimatedClearanceTicks: this.estimatedIncidentClearanceTicks(incident),
      });
      this.incidentLog.push({
        kind: "ACCIDENT_INTERRUPT",
        tick: this.currentTick,
        incidentId: incident.id,
        interruptReason: reason,
        vehicleIds: [...incident.vehicleIds],
        pedestrianIds: [...incident.pedestrianIds],
        lockedResourceIds: [...incident.lockedResourceIds],
      });
    }
    return reasons.join("; ");
  }

  private activateSecondaryAccidents(
    vehicleIntents: readonly VehicleMoveIntent[],
  ): string | undefined {
    const affected = new Set<string>();
    for (const intent of vehicleIntents) {
      const vehicle = this.vehicles.get(intent.vehicleId);
      if (vehicle === undefined || vehicle.state !== "CROSSING") {
        continue;
      }
      const incident = this.incidents.find(
        (candidate) =>
          candidate.status === "OPEN" &&
          !candidate.vehicleIds.includes(vehicle.id) &&
          candidate.lockedResourceIds.some((resourceId) =>
            intent.resourceIds.has(resourceId),
          ),
      );
      if (incident === undefined) {
        continue;
      }
      const contactResourceId = [...intent.resourceIds].find((resourceId) =>
        incident.lockedResourceIds.includes(resourceId),
      );
      const impactedVehicle = nearestCollisionVehicle(
        vehicle,
        incident.vehicleIds.flatMap((id) => {
          const candidate = this.vehicles.get(id);
          return candidate === undefined ? [] : [candidate];
        }),
        this.network,
      );
      if (impactedVehicle === undefined) {
        continue;
      }
      incident.vehicleIds.push(vehicle.id);
      this.refreshIncidentSeverity(incident);
      const collision = solveCollisionOutcome({
        tick: this.currentTick,
        resourceId: contactResourceId ?? `SPACE:0:0`,
        collisionType: incident.collisionType,
        severity: incident.severity,
        vehicles: [vehicle, impactedVehicle],
        pedestrians: [],
        network: this.network,
      });
      incident.collisionOutcomes.push(collision);
      vehicle.state = "ACCIDENT_STOPPED";
      vehicle.incidentId = incident.id;
      this.noteRiskAccident(vehicle);
      this.releaseReservations(vehicle.id);
      affected.add(incident.id);
      this.incidentLog.push({
        kind: "SECONDARY_ACCIDENT",
        tick: this.currentTick,
        incidentId: incident.id,
        vehicleId: vehicle.id,
        vehicleIds: [...incident.vehicleIds],
        collisionType: incident.collisionType,
        severity: incident.severity,
        collisionOutcomes: [collision],
        estimatedClearanceTicks: this.estimatedIncidentClearanceTicks(incident),
      });
    }
    if (affected.size === 0) {
      return undefined;
    }
    this.refreshIncidentLocks();
    return [...affected]
      .map(
        (incidentId) =>
          `ACCIDENT_INTERRUPT incident=${incidentId} secondary=true`,
      )
      .join("; ");
  }

  private bindCollision(collision: ScheduledCollision): TrackedIncident {
    const ids = [...collision.vehicleIds];
    const pedestrianIds = [...(collision.pedestrianIds ?? [])];
    let incident = this.incidents.find(
      (item) =>
        item.status === "OPEN" &&
        (item.vehicleIds.some((vehicleId) => ids.includes(vehicleId)) ||
          item.pedestrianIds.some((pedestrianId) =>
            pedestrianIds.includes(pedestrianId),
          )),
    );
    if (incident === undefined) {
      const classification = this.classifyCollision(collision);
      incident = {
        id: `INC${String(this.nextIncidentSequence).padStart(4, "0")}`,
        triggerTick: this.currentTick,
        status: "OPEN",
        collisionType: classification.collisionType,
        severity: classification.severity,
        vehicleIds: [],
        pedestrianIds: [],
        lockedResourceIds: [],
        evacuationStepTicks: classification.evacuationStepTicks,
        collisionOutcomes: [],
      };
      this.nextIncidentSequence += 1;
      this.incidents.push(incident);
    }
    this.refreshIncidentSeverity(incident);
    const outcome = solveCollisionOutcome({
      tick: this.currentTick,
      resourceId: collision.resourceId,
      collisionType: incident.collisionType,
      severity: incident.severity,
      vehicles: ids.flatMap((id) => {
        const vehicle = this.vehicles.get(id);
        return vehicle === undefined ? [] : [vehicle];
      }),
      pedestrians: pedestrianIds.flatMap((id) => {
        const pedestrian = this.pedestrians.get(id);
        return pedestrian === undefined ? [] : [pedestrian];
      }),
      network: this.network,
    });
    incident.collisionOutcomes.push(outcome);
    for (const vehicleId of ids) {
      if (!incident.vehicleIds.includes(vehicleId)) {
        incident.vehicleIds.push(vehicleId);
      }
      const vehicle = this.vehicles.get(vehicleId);
      if (
        vehicle?.state === "CROSSING" ||
        vehicle?.state === "EXIT_BLOCKED" ||
        vehicle?.state === "EVACUATING"
      ) {
        vehicle.state = "ACCIDENT_STOPPED";
        vehicle.incidentId = incident.id;
        this.noteRiskAccident(vehicle);
        this.releaseReservations(vehicleId);
      }
    }
    for (const pedestrianId of pedestrianIds) {
      if (!incident.pedestrianIds.includes(pedestrianId)) {
        incident.pedestrianIds.push(pedestrianId);
      }
      const pedestrian = this.pedestrians.get(pedestrianId);
      if (
        pedestrian !== undefined &&
        pedestrian.state !== "INJURED"
      ) {
        pedestrian.state = "INJURED";
        pedestrian.incidentId = incident.id;
        this.releaseReservations(pedestrianId);
        this.pendingPedestrianCollisions.add(pedestrianId);
        this.pedestrianEvents.push({
          kind: "PED_COLLISION",
          tick: this.currentTick,
          pedestrianIds: [pedestrianId],
          crosswalkId: pedestrian.crosswalkId,
          directions: [pedestrian.direction],
          incidentId: incident.id,
          resourceId: collision.resourceId,
        });
      }
    }
    return incident;
  }

  private refreshIncidentLocks(): void {
    this.lockedResources.clear();
    for (const incident of this.incidents) {
      if (incident.status !== "OPEN") {
        continue;
      }
      if (
        incident.clearanceReadyTick !== undefined &&
        this.currentTick >= incident.clearanceReadyTick
      ) {
        for (const vehicleId of incident.vehicleIds) {
          const vehicle = this.vehicles.get(vehicleId);
          if (
            vehicle?.state === "ACCIDENT_STOPPED" ||
            vehicle?.state === "EVACUATING"
          ) {
            this.releaseReservations(vehicleId);
            this.vehicles.delete(vehicleId);
          }
        }
        for (const pedestrianId of incident.pedestrianIds) {
          const pedestrian = this.pedestrians.get(pedestrianId);
          if (pedestrian?.state === "INJURED") {
            this.releaseReservations(pedestrianId);
            this.pedestrians.delete(pedestrianId);
          }
        }
      }
      const covered = new Set<string>();
      for (const vehicleId of incident.vehicleIds) {
        const vehicle = this.vehicles.get(vehicleId);
        if (
          vehicle === undefined ||
          (vehicle.state !== "ACCIDENT_STOPPED" &&
            vehicle.state !== "EVACUATING")
        ) {
          continue;
        }
        const trajectory = this.network.trajectories.get(vehicle.routeId);
        if (trajectory === undefined) {
          continue;
        }
        for (const resourceId of resourcesCoveredByVehicle(
          vehicle,
          trajectory.slots,
        )) {
          covered.add(resourceId);
        }
        if (vehicle.state === "ACCIDENT_STOPPED") {
          for (const outcome of incident.collisionOutcomes) {
            const vehicleOutcome = outcome.vehicles.find(
              (candidate) => candidate.vehicleId === vehicle.id,
            );
            for (const resourceId of vehicleOutcome?.hazardResourceIds ?? []) {
              covered.add(resourceId);
            }
          }
        }
      }
      for (const pedestrianId of incident.pedestrianIds) {
        const pedestrian = this.pedestrians.get(pedestrianId);
        const resourceId =
          pedestrian === undefined
            ? undefined
            : this.pedestrianCellResourceId(pedestrian);
        if (resourceId !== undefined) {
          covered.add(resourceId);
        }
        for (const outcome of incident.collisionOutcomes) {
          const pedestrianOutcome = outcome.pedestrians.find(
            (candidate) => candidate.pedestrianId === pedestrianId,
          );
          for (const hazardResourceId of
            pedestrianOutcome?.hazardResourceIds ?? []) {
            covered.add(hazardResourceId);
          }
        }
      }
      const allClear =
        incident.vehicleIds.every((vehicleId) =>
          this.hasLeftConflictArea(vehicleId),
        ) &&
        incident.pedestrianIds.every(
          (pedestrianId) => !this.pedestrians.has(pedestrianId),
        );
      if (allClear) {
        incident.status = "CLOSED";
        this.releaseIncidentLaneHolds(incident.id);
        incident.lockedResourceIds = [];
        incident.clearanceLatencyTicks =
          this.currentTick - incident.triggerTick;
        this.incidentLog.push({
          kind: "ACCIDENT_CLEARED",
          tick: this.currentTick,
          incidentId: incident.id,
          vehicleIds: [...incident.vehicleIds],
          pedestrianIds: [...incident.pedestrianIds],
          clearanceLatencyTicks: incident.clearanceLatencyTicks,
          collisionType: incident.collisionType,
          severity: incident.severity,
          estimatedClearanceTicks: 0,
        });
        continue;
      }
      incident.lockedResourceIds = [...covered].sort();
      for (const resourceId of incident.lockedResourceIds) {
        this.lockedResources.add(resourceId);
      }
    }
  }

  private hasLeftConflictArea(vehicleId: VehicleId): boolean {
    const vehicle = this.vehicles.get(vehicleId);
    if (vehicle === undefined) {
      return true;
    }
    if (vehicle.state === "OUTBOUND" || vehicle.state === "DESPAWNED") {
      return true;
    }
    if (
      vehicle.state !== "ACCIDENT_STOPPED" &&
      vehicle.state !== "EVACUATING" &&
      vehicle.state !== "CROSSING"
    ) {
      return false;
    }
    const trajectory = this.network.trajectories.get(vehicle.routeId);
    if (trajectory === undefined) {
      return true;
    }
    const tailSlot = vehicle.trajectoryHeadSlot - vehicle.lengthSlots + 1;
    return tailSlot >= trajectory.slots.length;
  }

  private trajectoryHeading(trajectory: Trajectory, index: number): number {
    const slot = trajectory.slots[index];
    if (slot === undefined) {
      return 0;
    }
    const previous = trajectory.slots[Math.max(0, index - 1)] ?? slot;
    const next =
      trajectory.slots[Math.min(trajectory.slots.length - 1, index + 1)] ?? slot;
    return Math.atan2(next.x - previous.x, next.y - previous.y);
  }

  private summarizeIncident(incident: TrackedIncident): IncidentSummary {
    const locked = incident.lockedResourceIds;
    const summary: IncidentSummary = {
      id: incident.id,
      triggerTick: incident.triggerTick,
      status: incident.status,
      collisionType: incident.collisionType,
      severity: incident.severity,
      vehicleIds: [...incident.vehicleIds],
      pedestrianIds: [...incident.pedestrianIds],
      lockedResourceIds: [...locked],
      severedRouteIds: this.routesUsing(locked),
      suggestedEvacLanes: this.suggestedEvacLanes(
        locked,
        incident.vehicleIds,
      ),
      activeLaneHolds: this.activeLaneHoldViews().filter(
        (hold) => hold.incidentId === incident.id,
      ),
      estimatedClearanceTicks: this.estimatedIncidentClearanceTicks(incident),
      secondaryCollisionRisk:
        incident.status === "OPEN" && this.crossingMayReachIncident(incident),
      collisionOutcomes: [...incident.collisionOutcomes],
    };
    return incident.clearanceLatencyTicks === undefined
      ? summary
      : {
          ...summary,
          clearanceLatencyTicks: incident.clearanceLatencyTicks,
        };
  }

  private severedRouteIds(): RouteId[] {
    return this.routesUsing([...this.lockedResources]);
  }

  private classifyCollision(collision: ScheduledCollision): {
    collisionType: IncidentSummary["collisionType"];
    severity: IncidentSummary["severity"];
    evacuationStepTicks: number;
  } {
    const [leftId, rightId] = collision.vehicleIds;
    const left = leftId === undefined ? undefined : this.vehicles.get(leftId);
    const right = rightId === undefined ? undefined : this.vehicles.get(rightId);
    if (
      left !== undefined &&
      right !== undefined &&
      (left.routeId === right.routeId ||
        left.inboundLaneId === right.inboundLaneId)
    ) {
      return {
        collisionType: "REAR_END",
        severity: "MODERATE",
        evacuationStepTicks: 2,
      };
    }
    if (collision.resourceId.startsWith("PAIR:")) {
      return {
        collisionType: "SCRAPE",
        severity: "MINOR",
        evacuationStepTicks: 1,
      };
    }
    return {
      collisionType: "ANGLE_COLLISION",
      severity: "SERIOUS",
      evacuationStepTicks: 3,
    };
  }

  private refreshIncidentSeverity(incident: TrackedIncident): void {
    if (incident.vehicleIds.length >= 3) {
      incident.collisionType = "PILEUP";
      incident.severity = "CRITICAL";
      incident.evacuationStepTicks = 3;
    }
    if (incident.clearanceReadyTick !== undefined) {
      incident.clearanceReadyTick = Math.max(
        incident.clearanceReadyTick,
        this.currentTick + this.incidentPreparationTicks(incident),
      );
    }
  }

  private incidentPreparationTicks(incident: TrackedIncident): number {
    const base =
      incident.collisionType === "SCRAPE"
        ? 3
        : incident.collisionType === "REAR_END"
          ? 8
          : incident.collisionType === "ANGLE_COLLISION"
            ? 14
            : 20 + Math.max(0, incident.vehicleIds.length - 3) * 5;
    const heavy = incident.vehicleIds.filter((vehicleId) => {
      const vehicle = this.vehicles.get(vehicleId);
      const kind = vehicle === undefined ? undefined : vehicleClass(vehicle.type);
      return kind === "truck" || kind === "bus";
    }).length;
    return base + heavy * 2;
  }

  private estimatedIncidentClearanceTicks(incident: TrackedIncident): number {
    if (incident.status === "CLOSED") {
      return 0;
    }
    const preparation = Math.max(
      0,
      (incident.clearanceReadyTick ??
        this.currentTick + this.incidentPreparationTicks(incident)) -
        this.currentTick,
    );
    return preparation;
  }

  private incidentHazardMultiplier(
    severity: IncidentSummary["severity"],
  ): number {
    return severity === "MINOR"
      ? 1
      : severity === "MODERATE"
        ? 1.5
        : severity === "SERIOUS"
          ? 2
          : 3;
  }

  private crossingMayReachIncident(incident: TrackedIncident): boolean {
    const locked = new Set(incident.lockedResourceIds);
    return [...this.vehicles.values()].some(
      (vehicle) =>
        vehicle.state === "CROSSING" &&
        !incident.vehicleIds.includes(vehicle.id) &&
        trajectoryUsesResources(
          this.network.trajectories.get(vehicle.routeId)?.slots ?? [],
          locked,
        ),
    );
  }

  private activeLaneHoldViews(): ActiveLaneHoldView[] {
    return [...this.heldInboundLanes.values()]
      .map((hold) => ({
        ...hold,
        autoRelease: "ACCIDENT_CLEARED" as const,
      }))
      .sort((left, right) => left.laneId.localeCompare(right.laneId));
  }

  private openIncidentSevering(trajectory: Trajectory): TrackedIncident | undefined {
    return this.incidents.find(
      (incident) =>
        incident.status === "OPEN" &&
        trajectoryUsesResources(
          trajectory.slots,
          new Set(incident.lockedResourceIds),
        ),
    );
  }

  private releaseIncidentLaneHolds(incidentId: string): void {
    for (const [laneId, hold] of this.heldInboundLanes) {
      if (hold.incidentId !== incidentId) {
        continue;
      }
      this.heldInboundLanes.delete(laneId);
      this.incidentLog.push({
        kind: "LANE_DETOUR",
        tick: this.currentTick,
        incidentId,
        action: "RELEASE_AT_STOPLINE",
        laneId: hold.laneId,
        routeId: hold.routeId,
      });
    }
  }

  private routesUsing(resourceIds: readonly string[]): RouteId[] {
    const locked = new Set(resourceIds);
    const severed: RouteId[] = [];
    for (const trajectory of this.network.trajectories.values()) {
      if (trajectoryUsesResources(trajectory.slots, locked)) {
        severed.push(trajectory.id);
      }
    }
    return severed.sort();
  }

  private suggestedEvacLanes(
    resourceIds: readonly string[],
    vehicleIds: readonly VehicleId[] = [],
  ): LaneId[] {
    const locked = new Set(resourceIds);
    const lanes = new Set<LaneId>();
    if (vehicleIds.length > 0) {
      for (const vehicleId of vehicleIds) {
        const vehicle = this.vehicles.get(vehicleId);
        const current =
          vehicle === undefined
            ? undefined
            : this.network.trajectories.get(vehicle.routeId);
        const head =
          current === undefined
            ? undefined
            : current.slots[vehicle?.trajectoryHeadSlot ?? -1];
        if (vehicle === undefined || current === undefined || head === undefined) {
          continue;
        }
        const currentHeading = this.trajectoryHeading(
          current,
          vehicle.trajectoryHeadSlot,
        );
        for (const trajectory of this.network.trajectories.values()) {
          const index = trajectory.slots.findIndex(
            (slot) => slot.x === head.x && slot.y === head.y,
          );
          if (
            index >= 0 &&
            Math.cos(this.trajectoryHeading(trajectory, index) - currentHeading) >=
              Math.SQRT1_2
          ) {
            lanes.add(trajectory.outboundLaneId);
          }
        }
      }
      if (lanes.size > 0) {
        return [...lanes].sort();
      }
    }
    for (const trajectory of this.network.trajectories.values()) {
      if (trajectoryUsesResources(trajectory.slots, locked)) {
        lanes.add(trajectory.outboundLaneId);
      }
    }
    return [...lanes].sort();
  }

  private resolveRoute(id: string): Trajectory | undefined {
    const direct = this.network.trajectories.get(id);
    if (direct !== undefined) {
      return direct;
    }
    for (const trajectory of this.network.trajectories.values()) {
      if (trajectory.inboundLaneId === id) {
        return trajectory;
      }
    }
    return undefined;
  }

  private formatInterrupt(incident: TrackedIncident): string {
    const pedestrianPart =
      incident.pedestrianIds.length === 0
        ? ""
        : ` pedestrians=${incident.pedestrianIds.join(",")}`;
    return `ACCIDENT_INTERRUPT incident=${incident.id} locked=${incident.lockedResourceIds.join(",")} vehicles=${incident.vehicleIds.join(",")}${pedestrianPart}`;
  }

  private collisionKey(collision: ScheduledCollision): string {
    return `${collision.tick}|${[...collision.vehicleIds].sort().join(",")}|${[...(collision.pedestrianIds ?? [])].sort().join(",")}|${collision.resourceId}`;
  }

  private releaseReservations(actorId: string): void {
    const emptyTicks: number[] = [];
    for (const [tick, resources] of this.reservationTable) {
      for (const [resourceId, owner] of resources) {
        if (owner === actorId) {
          resources.delete(resourceId);
        }
      }
      if (resources.size === 0) {
        emptyTicks.push(tick);
      }
    }
    for (const tick of emptyTicks) {
      this.reservationTable.delete(tick);
    }
  }

  private admissionControl(
    mode: "DRY_RUN" | "COMMIT",
    excludedCreepVehicleIds: ReadonlySet<VehicleId> = new Set(),
  ) {
    return {
      mode,
      slowStartSteps: this.dynamics.slowStartSteps,
      lockedResourceIds: this.lockedResources,
      heldInboundLaneIds: new Set(this.heldInboundLanes.keys()),
      exitBlockedResourceIds: this.exitBlockedResources,
      creepOccupations: this.creepOccupations(excludedCreepVehicleIds),
      controlResourceBlocked: (
        resourceId: string,
        routeId: string,
        tick: number,
      ) => this.crosswalkCovers(resourceId, routeId, tick),
      routeAuthorized: (vehicle: Vehicle, trajectory: Trajectory) => {
        if (trajectory.guidanceForRouteId === undefined) {
          return true;
        }
        const permit = this.laneGuidancePermits.get(vehicle.id);
        return (
          permit?.guidedRouteId === trajectory.id &&
          permit.intentRouteId === vehicle.intentRouteId
        );
      },
    };
  }

  private enterCrossing(vehicle: Vehicle, rogue = false): void {
    this.laneGuidancePermits.delete(vehicle.id);
    vehicle.trajectoryHeadSlot = 0;
    vehicle.state = "CROSSING";
    vehicle.encroaching = false;
    vehicle.admittedAtTick = this.currentTick;
    vehicle.startupLagRemaining = 0;
    vehicle.stationaryTicks = 0;
    delete vehicle.scheduledEnterTick;
    delete vehicle.admissionState;
    delete vehicle.scheduledAdmissionOrder;
    delete vehicle.scheduledBatchId;
    delete vehicle.scheduledSlideTicks;
    if (!rogue) {
      if (vehicle.violation === "TAILGATE") {
        delete vehicle.violation;
      }
      if (this.dynamics.vehicleAggression) {
        this.pendingTailgateLeaders.add(vehicle.id);
      }
    }
  }

  /** Lane followers that would tailgate if the given vehicles were the last released ones. */
  tailgateRisk(releasedVehicleIds: readonly VehicleId[]): TailgateRisk[] {
    if (!this.dynamics.vehicleAggression) {
      return [];
    }
    const released = new Set(releasedVehicleIds);
    const risks: TailgateRisk[] = [];
    for (const laneId of [...this.network.inboundLanes.keys()].sort()) {
      const queue = this.inboundVehiclesForLane(laneId);
      let lastIndex = -1;
      queue.forEach((vehicle, index) => {
        if (released.has(vehicle.id) || vehicle.scheduledEnterTick !== undefined) {
          lastIndex = index;
        }
      });
      const leader = queue[lastIndex];
      if (leader === undefined || !released.has(leader.id)) {
        continue;
      }
      for (const follower of this.tailgateFollowers(leader, queue.slice(lastIndex + 1))) {
        risks.push({ vehicleId: follower.id, laneId, behindVehicleId: leader.id });
      }
    }
    return risks;
  }

  private markTailgaters(leader: Vehicle): void {
    const queue = this.inboundVehiclesForLane(leader.inboundLaneId).filter(
      (vehicle) => vehicle.inboundHeadSlot < leader.inboundHeadSlot,
    );
    for (const follower of this.tailgateFollowers(leader, queue)) {
      follower.violation = "TAILGATE";
    }
  }

  private tailgateFollowers(leader: Vehicle, followers: readonly Vehicle[]): Vehicle[] {
    const result: Vehicle[] = [];
    let ahead = leader;
    for (const follower of followers) {
      if (result.length >= TAILGATE_FOLLOWER_LIMIT) {
        break;
      }
      const gap =
        ahead.inboundHeadSlot - ahead.lengthSlots - follower.inboundHeadSlot;
      if (
        gap > TAILGATE_MAX_GAP_SLOTS ||
        follower.state === "STALLED" ||
        follower.scheduledEnterTick !== undefined ||
        !this.mayActOut(follower)
      ) {
        break;
      }
      const temperament = temperamentFor(follower.type);
      const remaining = driverPatienceRemaining(follower);
      if (
        remaining > 0 &&
        !(temperament === "AGGRESSIVE" && remaining <= DRIVER_WARNING_REMAINING_TICKS)
      ) {
        break;
      }
      result.push(follower);
      ahead = follower;
    }
    return result;
  }

  private mayActOut(vehicle: Vehicle): boolean {
    return (
      (vehicle.violation === undefined || vehicle.violation === "CUT_IN") &&
      temperamentFor(vehicle.type) !== "EXEMPT"
    );
  }

  private stepAggression(): {
    readonly enteredVehicleIds: VehicleId[];
    readonly interruptReason?: string;
  } {
    if (!this.dynamics.vehicleAggression) {
      return { enteredVehicleIds: [] };
    }
    for (const leaderId of [...this.pendingTailgateLeaders].sort()) {
      const leader = this.vehicles.get(leaderId);
      if (leader !== undefined) {
        this.markTailgaters(leader);
      }
    }
    this.pendingTailgateLeaders.clear();
    this.stepCutIns();
    const reasons: string[] = [];
    const enteredVehicleIds: VehicleId[] = [];
    const heads = this.laneHeadVehicleIds();
    for (const laneId of [...heads.keys()].sort()) {
      const vehicleId = heads.get(laneId);
      const vehicle = vehicleId === undefined ? undefined : this.vehicles.get(vehicleId);
      if (vehicle === undefined || vehicle.state !== "AT_STOPLINE") {
        continue;
      }
      if (vehicle.violation === "TAILGATE" && vehicle.scheduledEnterTick !== undefined) {
        delete vehicle.violation;
      }
      if (vehicle.scheduledEnterTick !== undefined) {
        continue;
      }
      const trajectory = this.network.trajectories.get(vehicle.routeId);
      if (
        trajectory === undefined ||
        trajectory.inboundLaneId !== vehicle.inboundLaneId ||
        this.heldInboundLanes.has(laneId) ||
        trajectory.slots.some((slot) =>
          slot.conflictResourceIds.some((resourceId) => this.lockedResources.has(resourceId)),
        )
      ) {
        continue;
      }
      if (vehicle.violation === "TAILGATE") {
        if (
          this.poseOccupiedByOther(vehicle, trajectory.slots) ||
          this.pedestrianOnRogueRoute(vehicle, trajectory)
        ) {
          continue;
        }
        this.enterRogueCrossing(vehicle, trajectory, "TAILGATE");
        this.aggressionCounts.tailgate += 1;
        reasons.push(`VEHICLE_TAILGATE vehicle=${vehicle.id} route=${vehicle.routeId}`);
        enteredVehicleIds.push(vehicle.id);
        continue;
      }
      if (
        !this.mayActOut(vehicle) ||
        !driverPatienceExhausted(vehicle) ||
        !this.rogueGapClear(vehicle, trajectory)
      ) {
        continue;
      }
      this.enterRogueCrossing(vehicle, trajectory, "RED_LIGHT");
      this.aggressionCounts.redLight += 1;
      reasons.push(`VEHICLE_RED_LIGHT vehicle=${vehicle.id} route=${vehicle.routeId}`);
      enteredVehicleIds.push(vehicle.id);
    }
    return reasons.length === 0
      ? { enteredVehicleIds }
      : { enteredVehicleIds, interruptReason: reasons.join("; ") };
  }

  /**
   * Rogue drivers still stop for people: anyone walking on a crosswalk the route
   * uses, or holding a crosswalk reservation the route would cross, keeps them back.
   */
  private pedestrianOnRogueRoute(vehicle: Vehicle, trajectory: Trajectory): boolean {
    const crosswalkIds = new Set(this.routeCrosswalkIds(trajectory.id));
    if (crosswalkIds.size === 0) {
      return false;
    }
    for (const pedestrian of this.pedestrians.values()) {
      if (
        crosswalkIds.has(pedestrian.crosswalkId) &&
        (pedestrian.state === "CROSSING_RESERVED" || pedestrian.state === "CROSSING_JAYWALK")
      ) {
        return true;
      }
    }
    for (const occupation of vehicleOccupationTimeline(
      vehicle,
      trajectory.slots,
      this.dynamics.slowStartSteps,
    )) {
      const owners = this.reservationTable.get(this.currentTick + occupation.tickOffset);
      if (owners === undefined) {
        continue;
      }
      for (const resourceId of occupation.resourceIds) {
        const owner = owners.get(resourceId);
        if (owner !== undefined && owner !== vehicle.id && !this.vehicles.has(owner)) {
          return true;
        }
      }
    }
    return false;
  }

  /** A rogue driver only looks at what currently sits in the first few slots ahead. */
  private rogueGapClear(vehicle: Vehicle, trajectory: Trajectory): boolean {
    if (
      this.poseOccupiedByOther(vehicle, trajectory.slots) ||
      this.pedestrianOnRogueRoute(vehicle, trajectory)
    ) {
      return false;
    }
    const now = this.reservationTable.get(this.currentTick);
    const creeping = this.creepOccupations(new Set([vehicle.id]));
    for (const slot of trajectory.slots.slice(0, ROGUE_GAP_CHECK_SLOTS)) {
      for (const resourceId of slot.conflictResourceIds) {
        const owner = now?.get(resourceId);
        if (owner !== undefined && owner !== vehicle.id) {
          return false;
        }
        if (creeping.has(resourceId)) {
          return false;
        }
      }
    }
    return true;
  }

  private enterRogueCrossing(
    vehicle: Vehicle,
    trajectory: Trajectory,
    violation: "RED_LIGHT" | "TAILGATE",
  ): void {
    vehicle.violation = violation;
    const reason = violation === "RED_LIGHT" ? "RED_LIGHT_RUNNER" : "TAILGATER";
    for (let attempt = 0; attempt < ROGUE_CONFLICT_PASSES; attempt += 1) {
      const conflict = findReservationConflict(
        vehicle,
        trajectory.slots,
        this.currentTick,
        this.reservationTable,
        this.dynamics.slowStartSteps,
      );
      if (conflict === undefined) {
        writeVehicleReservation(
          vehicle,
          trajectory.slots,
          this.currentTick,
          this.reservationTable,
          this.dynamics.slowStartSteps,
        );
        break;
      }
      const other = this.vehicles.get(conflict.vehicleId);
      if (
        other !== undefined &&
        other.scheduledEnterTick !== undefined &&
        isInboundState(other.state)
      ) {
        this.revokeSchedules(
          other.inboundLaneId,
          this.scheduledFromVehicleBack(other),
          reason,
        );
        continue;
      }
      this.pendingCollisions.push({
        tick: conflict.tick,
        resourceId: conflict.resourceId,
        vehicleIds: other === undefined ? [vehicle.id] : [vehicle.id, other.id].sort(),
        ...(other === undefined ? { pedestrianIds: [conflict.vehicleId] } : {}),
      });
      writeVehicleReservationWhereFree(
        vehicle,
        trajectory.slots,
        this.currentTick,
        this.reservationTable,
        this.dynamics.slowStartSteps,
      );
      break;
    }
    this.enterCrossing(vehicle, true);
  }

  private stepCutIns(): void {
    const queueLengths = new Map<LaneId, number>();
    const queueLength = (laneId: LaneId): number => {
      const cached = queueLengths.get(laneId);
      if (cached !== undefined) {
        return cached;
      }
      const length = this.inboundVehiclesForLane(laneId).length;
      queueLengths.set(laneId, length);
      return length;
    };
    const candidates = [...this.vehicles.values()]
      .filter(
        (vehicle) =>
          isInboundState(vehicle.state) &&
          vehicle.state !== "STALLED" &&
          vehicle.scheduledEnterTick === undefined &&
          vehicle.violation === undefined &&
          vehicle.routeId === vehicle.intentRouteId &&
          temperamentFor(vehicle.type) !== "EXEMPT" &&
          driverPatienceExhausted(vehicle),
      )
      .sort((left, right) => left.id.localeCompare(right.id));
    for (const vehicle of candidates) {
      const distance = this.distanceToStopline(vehicle);
      if (
        distance < this.dynamics.laneGuidanceNearSlots ||
        distance > this.dynamics.laneGuidanceFarSlots
      ) {
        continue;
      }
      const sourceLength = queueLength(vehicle.inboundLaneId);
      const target = this.validLaneGuidanceTargetLaneIds(vehicle)
        .filter(
          (laneId) => sourceLength - queueLength(laneId) >= CUT_IN_MIN_QUEUE_ADVANTAGE,
        )
        .sort((left, right) => queueLength(left) - queueLength(right) || left.localeCompare(right))[0];
      if (target === undefined) {
        continue;
      }
      const sourceLaneId = vehicle.inboundLaneId;
      const result = this.guideInboundLaneChange(vehicle.id, target);
      if (!result.ok) {
        continue;
      }
      vehicle.violation = "CUT_IN";
      this.aggressionCounts.cutIn += 1;
      queueLengths.set(sourceLaneId, queueLength(sourceLaneId) - 1);
      queueLengths.set(target, queueLength(target) + 1);
    }
  }

  private maybeStall(vehicle: Vehicle): void {
    if (vehicle.stallChecked || vehicle.state !== "AT_STOPLINE") {
      return;
    }
    vehicle.stallChecked = true;
    if (vehicleClass(vehicle.type) === "emergency") {
      return;
    }
    if (
      !willStall(
        this.seed,
        vehicle.routeId,
        vehicle.generatedAtTick,
        this.dynamics.stallModulus,
      )
    ) {
      return;
    }
    vehicle.state = "STALLED";
    vehicle.encroaching = false;
    this.clearScheduledLane(vehicle.inboundLaneId);
    this.incidentLog.push({
      kind: "STALL",
      tick: this.currentTick,
      vehicleId: vehicle.id,
      laneId: vehicle.inboundLaneId,
      routeId: vehicle.routeId,
    });
  }

  private completeDueTowTasks(): void {
    for (const [vehicleId, task] of this.towTasks) {
      if (task.completionTick > this.currentTick) {
        continue;
      }
      const vehicle = this.vehicles.get(vehicleId);
      if (vehicle !== undefined && vehicle.state === "STALLED") {
        this.releaseReservations(vehicleId);
        this.vehicles.delete(vehicleId);
        this.incidentLog.push({
          kind: "TOW_COMPLETE",
          tick: this.currentTick,
          vehicleId,
          laneId: vehicle.inboundLaneId,
          routeId: vehicle.routeId,
          completionTick: task.completionTick,
          cost: task.cost,
        });
      }
      this.towTasks.delete(vehicleId);
    }
  }

  private promoteScheduledEntries(): VehicleId[] {
    const enteredVehicleIds: VehicleId[] = [];
    this.revokeSchedulesFacingJaywalkers();
    this.revokeSchedulesBehindUnscheduledVehicles();
    this.pruneAdmissionRevocations();
    const heads = this.laneHeadVehicleIds();
    const scheduled = [...this.vehicles.values()]
      .filter((vehicle) => vehicle.scheduledEnterTick !== undefined)
      .sort(
        (left, right) =>
          (left.scheduledAdmissionOrder ?? Number.MAX_SAFE_INTEGER) -
          (right.scheduledAdmissionOrder ?? Number.MAX_SAFE_INTEGER),
      );
    for (const vehicle of scheduled) {
      if (vehicle.scheduledEnterTick === undefined) {
        continue;
      }
      if (this.currentTick < vehicle.scheduledEnterTick) {
        continue;
      }
      if (!isInboundState(vehicle.state)) {
        this.clearScheduledAdmission(vehicle);
        continue;
      }
      const ready =
        heads.get(vehicle.inboundLaneId) === vehicle.id &&
        vehicle.state === "AT_STOPLINE";
      const trajectory = this.network.trajectories.get(vehicle.routeId);
      if (
        trajectory !== undefined &&
        trajectory.inboundLaneId !== vehicle.inboundLaneId
      ) {
        this.clearScheduledAdmission(vehicle);
        this.pendingCollisions = this.pendingCollisions.filter(
          (collision) => !collision.vehicleIds.includes(vehicle.id),
        );
        continue;
      }
      const collisionApproved = this.pendingCollisions.some((collision) => {
        if (!collision.vehicleIds.includes(vehicle.id)) {
          return false;
        }
        const otherId = collision.vehicleIds.find((id) => id !== vehicle.id);
        const other = otherId === undefined ? undefined : this.vehicles.get(otherId);
        return (
          other !== undefined &&
          other.inboundLaneId !== vehicle.inboundLaneId
        );
      });
      const blocked =
        trajectory === undefined ||
        this.poseOccupiedByOther(vehicle, trajectory.slots) ||
        (!collisionApproved && this.entryBlocked(vehicle, trajectory.slots));
      if (!ready || blocked) {
        this.elasticSlideLaneFrom(vehicle, this.currentTick + 1);
        if (
          (vehicle.scheduledSlideTicks ?? 0) >
          this.dynamics.scheduleSlideLimitTicks
        ) {
          this.revokeSchedules(
            vehicle.inboundLaneId,
            this.scheduledFromVehicleBack(vehicle),
            "SLIDE_LIMIT",
          );
        }
        continue;
      }
      writeVehicleReservation(
        vehicle,
        trajectory.slots,
        this.currentTick,
        this.reservationTable,
        this.dynamics.slowStartSteps,
      );
      this.enterCrossing(vehicle);
      enteredVehicleIds.push(vehicle.id);
    }
    return enteredVehicleIds;
  }

  private scheduledFromVehicleBack(vehicle: Vehicle): Vehicle[] {
    return [...this.vehicles.values()]
      .filter(
        (other) =>
          other.inboundLaneId === vehicle.inboundLaneId &&
          other.scheduledEnterTick !== undefined &&
          isInboundState(other.state) &&
          other.inboundHeadSlot <= vehicle.inboundHeadSlot,
      )
      .sort(
        (left, right) =>
          right.inboundHeadSlot - left.inboundHeadSlot ||
          (left.scheduledAdmissionOrder ?? Number.MAX_SAFE_INTEGER) -
            (right.scheduledAdmissionOrder ?? Number.MAX_SAFE_INTEGER),
      );
  }

  private revokeSchedulesFacingJaywalkers(): void {
    const jaywalkedCrosswalks = new Set(
      [...this.pedestrians.values()]
        .filter((pedestrian) => pedestrian.state === "CROSSING_JAYWALK")
        .map((pedestrian) => pedestrian.crosswalkId),
    );
    if (jaywalkedCrosswalks.size === 0) {
      return;
    }
    for (const laneId of this.network.inboundLanes.keys()) {
      const queue = this.inboundVehiclesForLane(laneId);
      const first = queue.findIndex(
        (vehicle) =>
          vehicle.scheduledEnterTick !== undefined &&
          this.routeCrosswalkIds(vehicle.routeId).some((crosswalkId) =>
            jaywalkedCrosswalks.has(crosswalkId),
          ),
      );
      if (first < 0) {
        continue;
      }
      this.revokeSchedules(
        laneId,
        queue
          .slice(first)
          .filter((vehicle) => vehicle.scheduledEnterTick !== undefined),
        "JAYWALKER_AHEAD",
      );
    }
  }

  private routeCrosswalkIds(routeId: RouteId): readonly ConflictResourceId[] {
    const cached = this.routeCrosswalkCache.get(routeId);
    if (cached !== undefined) {
      return cached;
    }
    const cells = new Map<string, ConflictResourceId>();
    for (const crosswalk of this.network.crosswalks.values()) {
      for (const cell of crosswalk.cells) {
        cells.set(cell.conflictResourceId, crosswalk.id);
      }
    }
    const crosswalkIds = [
      ...new Set(
        (this.network.trajectories.get(routeId)?.slots ?? []).flatMap((slot) =>
          slot.conflictResourceIds.flatMap((resourceId) => {
            const crosswalkId = cells.get(resourceId);
            return crosswalkId === undefined ? [] : [crosswalkId];
          }),
        ),
      ),
    ];
    this.routeCrosswalkCache.set(routeId, crosswalkIds);
    return crosswalkIds;
  }

  private revokeSchedulesBehindUnscheduledVehicles(): void {
    for (const laneId of this.network.inboundLanes.keys()) {
      const queue = this.inboundVehiclesForLane(laneId);
      const firstUnscheduled = queue.findIndex(
        (vehicle) => vehicle.scheduledEnterTick === undefined,
      );
      if (firstUnscheduled < 0) {
        continue;
      }
      this.revokeSchedules(
        laneId,
        queue
          .slice(firstUnscheduled + 1)
          .filter((vehicle) => vehicle.scheduledEnterTick !== undefined),
        "HEAD_UNSCHEDULED",
      );
    }
  }

  private elasticSlideLaneFrom(
    vehicle: Vehicle,
    firstEnterTick: number,
  ): void {
    const affected = this.scheduledFromVehicleBack(vehicle);
    const previousTicks = new Map(
      affected.map((item) => [item.id, item.scheduledEnterTick ?? firstEnterTick]),
    );
    this.elasticSlideScheduled(affected, firstEnterTick);
    for (const item of affected) {
      const previous = previousTicks.get(item.id);
      if (item.scheduledEnterTick === undefined || previous === undefined) {
        continue;
      }
      item.scheduledSlideTicks =
        (item.scheduledSlideTicks ?? 0) +
        Math.max(0, item.scheduledEnterTick - previous);
    }
  }

  private elasticSlideScheduled(
    affected: readonly Vehicle[],
    firstEnterTick: number,
  ): void {
    const affectedIds = new Set(affected.map((vehicle) => vehicle.id));
    for (const vehicle of affected) {
      this.releaseReservations(vehicle.id);
    }
    this.pendingCollisions = this.pendingCollisions.filter(
      (collision) =>
        !collision.vehicleIds.some((vehicleId) => affectedIds.has(vehicleId)),
    );

    const originalFirst = affected[0]?.scheduledEnterTick ?? firstEnterTick;
    const delta = Math.max(0, firstEnterTick - originalFirst);
    for (const vehicle of affected) {
      vehicle.motionCreditHalfSlots = 0;
      vehicle.slowMovesDone = 0;
      vehicle.slowPhase = 0;
      const trajectory = this.network.trajectories.get(vehicle.routeId);
      if (
        trajectory === undefined ||
        trajectory.inboundLaneId !== vehicle.inboundLaneId ||
        !isInboundState(vehicle.state)
      ) {
        this.clearScheduledAdmission(vehicle);
        continue;
      }
      let desiredTick = Math.max(
        firstEnterTick,
        (vehicle.scheduledEnterTick ?? firstEnterTick) + delta,
      );
      let staticBlock:
        | { error: string; conflictingResourceId?: string }
        | undefined;
      let conflict:
        | ReturnType<typeof findReservationConflict>
        | undefined;
      let wait = 0;
      while (wait < 128) {
        staticBlock = this.probeCrossing(
          vehicle,
          trajectory.slots,
          desiredTick,
          this.reservationTable,
        );
        conflict = findReservationConflict(
          vehicle,
          trajectory.slots,
          desiredTick,
          this.reservationTable,
          this.dynamics.slowStartSteps,
        );
        if (staticBlock === undefined && conflict === undefined) {
          break;
        }
        if (
          staticBlock?.error === "ROUTE_SEVERED" ||
          staticBlock?.error === "EXIT_FULL"
        ) {
          break;
        }
        desiredTick += 1;
        wait += 1;
      }
      if (staticBlock?.error === "ROUTE_SEVERED") {
        this.clearScheduledAdmission(vehicle);
        continue;
      }
      if (staticBlock?.error === "EXIT_FULL") {
        vehicle.scheduledEnterTick = this.currentTick + 1;
        continue;
      }
      if (
        staticBlock?.error === "CROSSWALK" ||
        conflict !== undefined
      ) {
        vehicle.scheduledEnterTick = this.currentTick + 1;
        continue;
      }
      writeVehicleReservation(
        vehicle,
        trajectory.slots,
        desiredTick,
        this.reservationTable,
        this.dynamics.slowStartSteps,
      );
      vehicle.scheduledEnterTick = desiredTick;
    }
  }

  private clearScheduledAdmission(vehicle: Vehicle): void {
    this.releaseReservations(vehicle.id);
    delete vehicle.scheduledEnterTick;
    delete vehicle.admissionState;
    delete vehicle.scheduledAdmissionOrder;
    delete vehicle.scheduledBatchId;
    delete vehicle.scheduledSlideTicks;
  }

  private clearScheduledLane(laneId: LaneId): void {
    const affected = [...this.vehicles.values()].filter(
      (vehicle) =>
        vehicle.inboundLaneId === laneId &&
        vehicle.scheduledEnterTick !== undefined,
    );
    if (affected.length === 0) {
      return;
    }
    const affectedIds = new Set(affected.map((vehicle) => vehicle.id));
    for (const vehicle of affected) {
      this.clearScheduledAdmission(vehicle);
    }
    this.pendingCollisions = this.pendingCollisions.filter(
      (collision) =>
        !collision.vehicleIds.some((vehicleId) => affectedIds.has(vehicleId)),
    );
  }

  private entryBlocked(
    vehicle: Vehicle,
    slots: Trajectory["slots"],
  ): boolean {
    const probe = cloneReservationTable(this.reservationTable);
    paintOccupations(probe, this.creepOccupations(), this.currentTick, 48);
    return this.probeCrossing(vehicle, slots, this.currentTick, probe) !== undefined
      || this.poseOccupiedByOther(vehicle, slots);
  }

  private poseOccupiedByOther(
    vehicle: Vehicle,
    slots: Trajectory["slots"],
  ): boolean {
    const origin = vehicle.encroaching ? 0 : vehicle.lengthSlots - 1;
    const needed = new Set<string>();
    for (let body = 0; body < vehicle.lengthSlots; body += 1) {
      const slot = slots[origin - body];
      if (slot === undefined) {
        continue;
      }
      for (const resourceId of slot.conflictResourceIds) {
        needed.add(resourceId);
      }
    }
    for (const other of this.vehicles.values()) {
      if (other.id === vehicle.id) {
        continue;
      }
      if (
        other.state !== "CROSSING" &&
        other.state !== "EXIT_BLOCKED" &&
        other.state !== "EVACUATING" &&
        other.state !== "ACCIDENT_STOPPED"
      ) {
        continue;
      }
      const trajectory = this.network.trajectories.get(other.routeId);
      if (trajectory === undefined) {
        continue;
      }
      for (const resourceId of resourcesCoveredByVehicle(other, trajectory.slots)) {
        if (needed.has(resourceId)) {
          return true;
        }
      }
    }
    return false;
  }

  private probeCrossing(
    vehicle: Vehicle,
    slots: Trajectory["slots"],
    enterTick: number,
    table: ReservationTable,
  ): {
    error: string;
    conflictingVehicleId?: VehicleId;
    conflictingResourceId?: string;
  } | undefined {
    if (trajectoryUsesResources(slots, this.lockedResources)) {
      return { error: "ROUTE_SEVERED" };
    }
    if (trajectoryUsesResources(slots, this.exitBlockedResources)) {
      return { error: "EXIT_FULL" };
    }
    if (
      vehicleOccupationTimeline(
        vehicle,
        slots,
        this.dynamics.slowStartSteps,
      ).some((occupation) =>
        [...occupation.controlResourceIds].some((resourceId) =>
          this.crosswalkCovers(
            resourceId,
            vehicle.routeId,
            enterTick + occupation.tickOffset,
          ),
        ),
      )
    ) {
      return { error: "CROSSWALK" };
    }
    const conflict = findReservationConflict(
      vehicle,
      slots,
      enterTick,
      table,
      this.dynamics.slowStartSteps,
    );
    if (conflict !== undefined) {
      return {
        error: "RESOURCE_CONFLICT",
        conflictingVehicleId: conflict.vehicleId,
        conflictingResourceId: conflict.resourceId,
      };
    }
    return undefined;
  }

  private creepOccupations(
    excludedVehicleIds: ReadonlySet<VehicleId> = new Set(),
  ): Map<string, VehicleId> {
    const occupations = new Map<string, VehicleId>();
    for (const vehicle of this.vehicles.values()) {
      if (
        excludedVehicleIds.has(vehicle.id) ||
        vehicle.scheduledEnterTick !== undefined ||
        !vehicle.encroaching ||
        vehicle.state !== "AT_STOPLINE"
      ) {
        continue;
      }
      const slot = this.network.trajectories.get(vehicle.routeId)?.slots[0];
      if (slot === undefined) {
        continue;
      }
      for (const resourceId of slot.conflictResourceIds) {
        occupations.set(resourceId, vehicle.id);
      }
    }
    return occupations;
  }

  private crosswalkCovers(
    _resourceId: string,
    _routeId: string,
    _tick: number,
  ): boolean {
    return false;
  }

  private exitHoldActive(laneId: string, tick = this.currentTick): boolean {
    return holdBlocksTick(
      visibleHolds(
        this.seed,
        [laneId],
        tick,
        this.dynamics.exitHoldPeriod,
        this.dynamics.exitHoldDuration,
        this.dynamics.exitHoldModulus,
        this.dynamics.exitHoldPeriod,
        "exit",
      ),
      laneId,
      tick,
    );
  }

  private outboundEntranceFree(laneId: string, lengthSlots: number): boolean {
    const occupied = new Set<number>();
    for (const vehicle of this.vehicles.values()) {
      if (vehicle.state !== "OUTBOUND" || vehicle.outboundLaneId !== laneId) {
        continue;
      }
      for (
        let slot = vehicle.outboundHeadSlot - vehicle.lengthSlots + 1;
        slot <= vehicle.outboundHeadSlot;
        slot += 1
      ) {
        occupied.add(slot);
      }
    }
    for (let slot = 0; slot < lengthSlots; slot += 1) {
      if (occupied.has(slot)) {
        return false;
      }
    }
    return true;
  }

  private refreshExitLocks(): void {
    this.exitBlockedResources.clear();
    for (const vehicle of this.vehicles.values()) {
      if (vehicle.state !== "EXIT_BLOCKED") {
        continue;
      }
      const trajectory = this.network.trajectories.get(vehicle.routeId);
      if (trajectory === undefined) {
        continue;
      }
      for (const resourceId of resourcesCoveredByVehicle(vehicle, trajectory.slots)) {
        this.exitBlockedResources.add(resourceId);
      }
    }
  }

  private emergencyAlerts() {
    const alerts = [];
    for (const vehicle of this.inboundEmergencies()) {
      const distanceToStopline = this.distanceToStopline(vehicle);
      if (distanceToStopline > EMERGENCY_ALERT_HORIZON_SLOTS) {
        continue;
      }
      const lane = this.inboundVehiclesForLane(vehicle.inboundLaneId);
      const index = lane.findIndex((item) => item.id === vehicle.id);
      alerts.push({
        vehicleId: vehicle.id,
        laneId: vehicle.inboundLaneId,
        queueIndex: index + 1,
        blockingVehicleIds: lane.slice(0, Math.max(0, index)).map((item) => item.id),
        delayBleedPerTick: this.dynamics.emergencyDelayBleedPerTick,
        distanceToStopline,
        stationaryTicks: vehicle.stationaryTicks,
        chargeActive:
          vehicle.stationaryTicks >= this.dynamics.waitingChargeGraceTicks,
      });
    }
    return alerts.sort((left, right) =>
      left.vehicleId.localeCompare(right.vehicleId),
    );
  }

  private takeEmergencyNotices(): EmergencyNotice[] {
    const notices: EmergencyNotice[] = [];
    for (const vehicle of this.inboundEmergencies()) {
      const distanceToStopline = this.distanceToStopline(vehicle);
      const inside = distanceToStopline <= EMERGENCY_ALERT_HORIZON_SLOTS;
      const kind: EmergencyNoticeKind = inside
        ? "ENTERED_HORIZON"
        : "OUTSIDE_HORIZON";
      const edge = `${vehicle.id}:${kind}`;
      if (this.announcedEmergencyEdges.has(edge)) {
        continue;
      }
      this.announcedEmergencyEdges.add(edge);
      notices.push({
        vehicleId: vehicle.id,
        laneId: vehicle.inboundLaneId,
        distanceToStopline,
        kind,
        surchargeActive:
          inside &&
          vehicle.stationaryTicks >= this.dynamics.waitingChargeGraceTicks,
      });
    }
    return notices.sort((left, right) =>
      left.vehicleId.localeCompare(right.vehicleId),
    );
  }

  private inboundEmergencies(): Vehicle[] {
    return [...this.vehicles.values()].filter(
      (vehicle) =>
        isInboundState(vehicle.state) &&
        vehicleClass(vehicle.type) === "emergency",
    );
  }

  private distanceToStopline(vehicle: Vehicle): number {
    const lane = this.network.inboundLanes.get(vehicle.inboundLaneId);
    if (lane === undefined) {
      return Number.POSITIVE_INFINITY;
    }
    return lane.capacitySlots - 1 - vehicle.inboundHeadSlot;
  }

  private guidanceTrajectory(
    intentRouteId: RouteId,
    targetLaneId: LaneId,
  ): Trajectory | undefined {
    return [...this.network.trajectories.values()].find(
      (trajectory) =>
        trajectory.guidanceForRouteId === intentRouteId &&
        trajectory.inboundLaneId === targetLaneId,
    );
  }

  private validLaneGuidanceTargetLaneIds(vehicle: Vehicle): LaneId[] {
    if (vehicle.routeId !== vehicle.intentRouteId) {
      return [];
    }
    return adjacentRouteIds(this.network, vehicle.intentRouteId)
      .map(
        (routeId) =>
          this.network.trajectories.get(routeId)?.inboundLaneId,
      )
      .filter(
        (laneId): laneId is LaneId =>
          laneId !== undefined &&
          this.guidanceTrajectory(vehicle.intentRouteId, laneId) !== undefined,
      )
      .sort();
  }

  private laneGuidanceOpportunities() {
    const grouped = new Map<
      string,
      {
        sourceLaneId: LaneId;
        targetLaneId: LaneId;
        eligibleVehicleIds: VehicleId[];
      }
    >();
    for (const vehicle of this.vehicles.values()) {
      if (
        !isInboundState(vehicle.state) ||
        vehicle.state === "STALLED" ||
        vehicle.scheduledEnterTick !== undefined
      ) {
        continue;
      }
      const distance = this.distanceToStopline(vehicle);
      if (
        distance < this.dynamics.laneGuidanceNearSlots ||
        distance > this.dynamics.laneGuidanceFarSlots
      ) {
        continue;
      }
      for (const targetLaneId of this.validLaneGuidanceTargetLaneIds(vehicle)) {
        const key = `${vehicle.inboundLaneId}|${targetLaneId}`;
        const entry = grouped.get(key) ?? {
          sourceLaneId: vehicle.inboundLaneId,
          targetLaneId,
          eligibleVehicleIds: [],
        };
        entry.eligibleVehicleIds.push(vehicle.id);
        grouped.set(key, entry);
      }
    }
    return [...grouped.values()]
      .map((entry) => ({
        ...entry,
        eligibleVehicleIds: entry.eligibleVehicleIds.sort(),
        sourceOccupancy: this.getQueueOccupancyRatio(entry.sourceLaneId),
        targetOccupancy: this.getQueueOccupancyRatio(entry.targetLaneId),
      }))
      .sort(
        (left, right) =>
          right.sourceOccupancy - left.sourceOccupancy ||
          left.sourceLaneId.localeCompare(right.sourceLaneId),
      );
  }

  private occupantInRange(
    laneId: LaneId,
    headSlot: number,
    lengthSlots: number,
    ignore: ReadonlySet<VehicleId>,
  ): { vehicleId: VehicleId; slot: number } | undefined {
    const needStart = headSlot - lengthSlots + 1;
    const needEnd = headSlot;
    for (const vehicle of this.vehicles.values()) {
      if (ignore.has(vehicle.id) || vehicle.inboundLaneId !== laneId) {
        continue;
      }
      if (!isInboundState(vehicle.state)) {
        continue;
      }
      const bodyStart = vehicle.inboundHeadSlot - vehicle.lengthSlots + 1;
      const bodyEnd = vehicle.inboundHeadSlot;
      if (bodyEnd < needStart || bodyStart > needEnd) {
        continue;
      }
      const slot = Math.max(bodyStart, needStart);
      return { vehicleId: vehicle.id, slot };
    }
    return undefined;
  }

  private laneNativeRouteId(laneId: LaneId): RouteId | undefined {
    return this.network.inboundLanes.get(laneId)?.routeId;
  }

  private adjacentLaneRouteIds(laneId: LaneId): RouteId[] {
    const native = this.laneNativeRouteId(laneId);
    return native === undefined ? [] : adjacentRouteIds(this.network, native);
  }

  private transferTrajectoryFor(
    vehicle: Vehicle,
    targetLaneId: LaneId,
  ): Trajectory | undefined {
    const intent =
      this.network.trajectories.get(vehicle.intentRouteId) ??
      this.network.trajectories.get(vehicle.routeId);
    const nativeId = this.laneNativeRouteId(targetLaneId);
    const native =
      nativeId === undefined ? undefined : this.network.trajectories.get(nativeId);
    if (intent === undefined || native === undefined) {
      return undefined;
    }
    if (native.id === intent.id || sameCourse(native, intent)) {
      return native;
    }
    return (
      this.guidanceTrajectory(intent.id, targetLaneId) ??
      [...this.network.trajectories.values()].find(
        (trajectory) =>
          trajectory.inboundLaneId === targetLaneId &&
          trajectory.guidanceForRouteId !== undefined &&
          sameCourse(trajectory, intent),
      )
    );
  }

  private validInboundTransferTargets(
    routeId: RouteId,
    vehicles: readonly Vehicle[] = [],
  ): RouteId[] {
    const source = this.network.trajectories.get(routeId);
    if (source === undefined) {
      return [];
    }
    const severed = new Set(this.severedRouteIds());
    return this.adjacentLaneRouteIds(source.inboundLaneId).filter(
      (candidate) => {
        const laneId = this.network.trajectories.get(candidate)?.inboundLaneId;
        if (laneId === undefined) {
          return false;
        }
        if (vehicles.length === 0) {
          return !severed.has(candidate);
        }
        return vehicles.some((vehicle) => {
          const trajectory = this.transferTrajectoryFor(vehicle, laneId);
          return trajectory !== undefined && !severed.has(trajectory.id);
        });
      },
    );
  }

  private validateInboundTransfer(
    vehicles: readonly Vehicle[],
    target: Trajectory,
  ): InboundTransferValidation | InboundTransferFailure {
    const first = vehicles[0];
    const targetLaneId = target.inboundLaneId;
    const validTargetRouteIds =
      first === undefined
        ? []
        : this.validInboundTransferTargets(first.routeId, [first]);
    const severed = new Set(this.severedRouteIds());
    if (severed.has(target.id)) {
      return {
        ok: false,
        error: "TARGET_SEVERED",
        detail: `Target route ${target.id} is severed.`,
        validTargetRouteIds,
      };
    }
    const plan: InboundTransferStep[] = [];
    for (const vehicle of vehicles) {
      if (
        !this.adjacentLaneRouteIds(vehicle.inboundLaneId).some(
          (routeId) =>
            this.network.trajectories.get(routeId)?.inboundLaneId ===
            targetLaneId,
        )
      ) {
        return {
          ok: false,
          error: "TARGET_NOT_ADJACENT",
          detail: `Target lane ${targetLaneId} is not directly adjacent to ${vehicle.inboundLaneId}.`,
          validTargetRouteIds,
        };
      }
      const trajectory = this.transferTrajectoryFor(vehicle, targetLaneId);
      if (trajectory === undefined) {
        return {
          ok: false,
          error: "MANEUVER_NOT_SUPPORTED",
          detail: `${vehicle.id} intends ${vehicle.intentRouteId}; lane ${targetLaneId} has no path that keeps that destination.`,
          validTargetRouteIds,
          unsupportedVehicleId: vehicle.id,
        };
      }
      if (severed.has(trajectory.id)) {
        return {
          ok: false,
          error: "TARGET_SEVERED",
          detail: `Target route ${trajectory.id} is severed.`,
          validTargetRouteIds,
        };
      }
      plan.push({ vehicle, trajectory });
    }
    const movingIds = new Set(vehicles.map((vehicle) => vehicle.id));
    for (const vehicle of vehicles) {
      const blocker = this.occupantInRange(
        targetLaneId,
        vehicle.inboundHeadSlot,
        vehicle.lengthSlots,
        movingIds,
      );
      if (blocker !== undefined) {
        return {
          ok: false,
          error: "TARGET_LANE_SLOT_OCCUPIED",
          detail: `Target lane ${targetLaneId} slot ${blocker.slot} is occupied by ${blocker.vehicleId}.`,
          validTargetRouteIds,
          blockingVehicleId: blocker.vehicleId,
          blockedSlot: blocker.slot,
        };
      }
    }
    return { ok: true, plan };
  }

  private applyInboundTransfer(plan: readonly InboundTransferStep[]): void {
    const movedIds = new Set(plan.map((step) => step.vehicle.id));
    for (const { vehicle } of plan) {
      this.clearScheduledAdmission(vehicle);
    }
    this.pendingCollisions = this.pendingCollisions.filter(
      (collision) =>
        !collision.vehicleIds.some((vehicleId) => movedIds.has(vehicleId)),
    );

    for (const { vehicle, trajectory } of plan) {
      const lane = this.network.inboundLanes.get(trajectory.inboundLaneId);
      if (lane === undefined) {
        throw new Error(`Unknown inbound lane: ${trajectory.inboundLaneId}`);
      }
      const sourceLaneId = vehicle.inboundLaneId;
      vehicle.routeId = trajectory.id;
      vehicle.inboundLaneId = trajectory.inboundLaneId;
      vehicle.outboundLaneId = trajectory.outboundLaneId;
      vehicle.stallBlockedTicks = 0;
      vehicle.startupLagRemaining = this.dynamics.startupLagTicks;
      vehicle.state =
        vehicle.inboundHeadSlot >= lane.capacitySlots - 1
          ? "AT_STOPLINE"
          : "QUEUED";
      vehicle.encroaching = false;
      if (trajectory.guidanceForRouteId === undefined) {
        this.laneGuidancePermits.delete(vehicle.id);
      } else {
        this.laneGuidancePermits.set(vehicle.id, {
          vehicleId: vehicle.id,
          sourceLaneId,
          targetLaneId: trajectory.inboundLaneId,
          intentRouteId: vehicle.intentRouteId,
          guidedRouteId: trajectory.id,
          grantedAtTick: this.currentTick,
        });
      }
    }
  }

  private revokeLaneSchedules(
    laneId: LaneId,
    reason: AdmissionRevocationReason,
    keep: ReadonlySet<VehicleId> = new Set(),
  ): void {
    this.revokeSchedules(
      laneId,
      [...this.vehicles.values()].filter(
        (vehicle) =>
          vehicle.inboundLaneId === laneId &&
          vehicle.scheduledEnterTick !== undefined &&
          !keep.has(vehicle.id),
      ),
      reason,
    );
  }

  private revokeSchedules(
    laneId: LaneId,
    vehicles: readonly Vehicle[],
    reason: AdmissionRevocationReason,
  ): void {
    if (vehicles.length === 0) {
      return;
    }
    const affectedIds = new Set(vehicles.map((vehicle) => vehicle.id));
    for (const vehicle of vehicles) {
      this.clearScheduledAdmission(vehicle);
    }
    this.pendingCollisions = this.pendingCollisions.filter(
      (collision) =>
        !collision.vehicleIds.some((vehicleId) => affectedIds.has(vehicleId)),
    );
    this.recordAdmissionRevocation(laneId, [...affectedIds].sort(), reason);
  }

  private pruneAdmissionRevocations(): void {
    const oldest = this.currentTick - ADMISSION_REVOCATION_WINDOW_TICKS;
    this.admissionRevocations = this.admissionRevocations.filter(
      (entry) => entry.tick >= oldest,
    );
  }

  private recentAdmissionRevocations(): AdmissionRevocation[] {
    const oldest = this.currentTick - ADMISSION_REVOCATION_WINDOW_TICKS;
    return this.admissionRevocations
      .filter((entry) => entry.tick >= oldest)
      .map((entry) => ({ ...entry, vehicleIds: [...entry.vehicleIds] }));
  }

  private recordAdmissionRevocation(
    laneId: LaneId,
    vehicleIds: readonly VehicleId[],
    reason: AdmissionRevocationReason,
  ): void {
    const kind = reason === "SLIDE_LIMIT" ? "ADMISSION_EXPIRED" : "ADMISSION_REVOKED";
    this.admissionRevocations.push({
      tick: this.currentTick,
      laneId,
      vehicleIds: [...vehicleIds],
      reason,
    });
    this.incidentLog.push({
      kind,
      tick: this.currentTick,
      laneId,
      vehicleIds: [...vehicleIds],
      reason,
    });
  }

  private stalledViews() {
    return [...this.vehicles.values()]
      .filter((vehicle) => vehicle.state === "STALLED")
      .map((vehicle) => {
        const followers = this.inboundVehiclesForLane(vehicle.inboundLaneId)
          .filter((other) => other.inboundHeadSlot < vehicle.inboundHeadSlot)
          .slice(0, 8);
        const validBypassLanes = this.validInboundTransferTargets(
          vehicle.routeId,
          followers,
        );
        const severed = new Set(this.severedRouteIds());
        const ignoredFollowers = new Set(
          followers.map((follower) => follower.id),
        );
        const towTask = this.towTasks.get(vehicle.id);
        return {
          vehicleId: vehicle.id,
          laneId: vehicle.inboundLaneId,
          routeId: vehicle.routeId,
          blockedBehindCount: this.inboundVehiclesForLane(
            vehicle.inboundLaneId,
          ).filter((other) => other.inboundHeadSlot < vehicle.inboundHeadSlot)
            .length,
          validBypassLanes,
          bypassAvailability: validBypassLanes.flatMap((routeId) => {
            const target = this.network.trajectories.get(routeId);
            if (target === undefined) {
              return [];
            }
            let maxMovableVehicles = 0;
            let blocker:
              | { vehicleId: VehicleId; slot: number }
              | undefined;
            let unsupportedVehicleId: VehicleId | undefined;
            for (const follower of followers) {
              const path = this.transferTrajectoryFor(
                follower,
                target.inboundLaneId,
              );
              if (path === undefined || severed.has(path.id)) {
                unsupportedVehicleId = follower.id;
                break;
              }
              blocker = this.occupantInRange(
                target.inboundLaneId,
                follower.inboundHeadSlot,
                follower.lengthSlots,
                ignoredFollowers,
              );
              if (blocker !== undefined) {
                break;
              }
              maxMovableVehicles += 1;
            }
            return [
              {
                routeId,
                laneId: target.inboundLaneId,
                maxMovableVehicles,
                ...(blocker === undefined
                  ? {}
                  : {
                      blockingVehicleId: blocker.vehicleId,
                      blockedSlot: blocker.slot,
                    }),
                ...(unsupportedVehicleId === undefined
                  ? {}
                  : { unsupportedVehicleId }),
              },
            ];
          }),
          ...(towTask === undefined
            ? {}
            : {
                towTask: {
                  status: "EN_ROUTE" as const,
                  completionTick: towTask.completionTick,
                  remainingTicks: Math.max(
                    0,
                    towTask.completionTick - this.currentTick,
                  ),
                  cost: towTask.cost,
                },
              }),
        };
      })
      .sort((left, right) => left.vehicleId.localeCompare(right.vehicleId));
  }

  private exitHoldViews() {
    return visibleHolds(
      this.seed,
      [...this.network.outboundLanes.keys()],
      this.currentTick,
      this.dynamics.exitHoldPeriod,
      this.dynamics.exitHoldDuration,
      this.dynamics.exitHoldModulus,
      this.dynamics.exitHoldPreview,
      "exit",
    ).map((hold) => ({
      laneId: hold.id,
      occupied: [...this.vehicles.values()].some(
        (vehicle) =>
          vehicle.outboundLaneId === hold.id &&
          (vehicle.state === "OUTBOUND" || vehicle.state === "EXIT_BLOCKED"),
      ),
      blockedUntilTick: hold.blockedUntilTick,
    }));
  }

  private crosswalkHoldViews() {
    return [];
  }

  private resolveTrajectory(id: string): Trajectory | undefined {
    const direct = this.network.trajectories.get(id);
    if (direct !== undefined) {
      return direct;
    }
    return [...this.network.trajectories.values()].find(
      (trajectory) =>
        trajectory.inboundLaneId === id || trajectory.outboundLaneId === id,
    );
  }

  private restoreInboundTransfer(
    saved: readonly SavedInboundVehicleState[],
    reservations: ReservationTable,
    pendingCollisions: readonly ScheduledCollision[],
    permits: ReadonlyMap<VehicleId, LaneGuidancePermit>,
  ): void {
    this.reservationTable = reservations;
    this.pendingCollisions = [...pendingCollisions];
    this.laneGuidancePermits.clear();
    for (const [vehicleId, permit] of permits) {
      this.laneGuidancePermits.set(vehicleId, permit);
    }
    for (const item of saved) {
      item.vehicle.routeId = item.routeId;
      item.vehicle.inboundLaneId = item.inboundLaneId;
      item.vehicle.outboundLaneId = item.outboundLaneId;
      item.vehicle.state = item.state;
      item.vehicle.startupLagRemaining = item.startupLagRemaining;
      item.vehicle.stallBlockedTicks = item.stallBlockedTicks;
      item.vehicle.stationaryTicks = item.stationaryTicks;
      item.vehicle.encroaching = item.encroaching;
      restoreOptionalVehicleField(
        item.vehicle,
        "scheduledEnterTick",
        item.scheduledEnterTick,
      );
      restoreOptionalVehicleField(
        item.vehicle,
        "admissionState",
        item.admissionState,
      );
      restoreOptionalVehicleField(
        item.vehicle,
        "scheduledAdmissionOrder",
        item.scheduledAdmissionOrder,
      );
      restoreOptionalVehicleField(
        item.vehicle,
        "scheduledBatchId",
        item.scheduledBatchId,
      );
      restoreOptionalVehicleField(
        item.vehicle,
        "scheduledSlideTicks",
        item.scheduledSlideTicks,
      );
    }
  }

  private inboundVehiclesForLane(laneId: LaneId): Vehicle[] {
    return [...this.vehicles.values()]
      .filter(
        (vehicle) =>
          vehicle.inboundLaneId === laneId &&
          isInboundState(vehicle.state),
      )
      .sort((left, right) => right.inboundHeadSlot - left.inboundHeadSlot);
  }

}

function transferRecords(
  plan: readonly InboundTransferStep[],
): LaneTransferRecord[] {
  return plan.map(({ vehicle, trajectory }) => ({
    vehicleId: vehicle.id,
    intentRouteId: vehicle.intentRouteId,
    routeId: trajectory.id,
  }));
}

function sameCourse(left: Trajectory, right: Trajectory): boolean {
  return (
    left.origin === right.origin &&
    left.destination === right.destination &&
    left.maneuver === right.maneuver
  );
}

function scheduledArrivalKey(arrival: ScheduledArrival): string {
  return `${arrival.tick}:${arrival.slot}`;
}

function emptyAdmissionBatch(tick: TickNumber): AdmissionBatchResult {
  return {
    tick,
    results: [],
    admittedVehicleIds: [],
    rejectedVehicleIds: [],
  };
}

function restoreEntityMap<T extends object>(
  target: Map<string, T>,
  snapshots: ReadonlyMap<string, Readonly<T>>,
): void {
  for (const id of target.keys()) {
    if (!snapshots.has(id)) {
      target.delete(id);
    }
  }
  for (const [id, snapshot] of snapshots) {
    const entity = target.get(id);
    if (entity === undefined) {
      target.set(id, { ...snapshot } as T);
      continue;
    }
    const mutable = entity as Record<string, unknown>;
    for (const key of Object.keys(mutable)) {
      if (!(key in snapshot)) {
        delete mutable[key];
      }
    }
    Object.assign(entity, snapshot);
  }
}

function isWaitingVehicle(vehicle: Vehicle): boolean {
  return (
    vehicle.state === "QUEUED" ||
    vehicle.state === "AT_STOPLINE" ||
    vehicle.state === "STALLED" ||
    vehicle.waitingTicks > 0
  );
}

function pedestrianRiskRank(pedestrian: Pedestrian): number {
  if (pedestrian.state === "CROSSING_JAYWALK") {
    return 0;
  }
  if (
    pedestrian.state === "WAITING" &&
    pedestrian.patienceLimit - pedestrian.waitingTicks <=
      PEDESTRIAN_WARNING_REMAINING_TICKS
  ) {
    return 1;
  }
  if (pedestrian.state === "INJURED") {
    return 2;
  }
  if (pedestrian.state === "WAITING") {
    return 3;
  }
  return 4;
}

function vehiclePositionKey(vehicle: Vehicle): string {
  return [
    vehicle.inboundLaneId,
    vehicle.inboundHeadSlot,
    vehicle.trajectoryHeadSlot,
    vehicle.outboundHeadSlot,
  ].join("|");
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

function isChargeableWaitingState(state: Vehicle["state"]): boolean {
  return (
    state === "QUEUED" ||
    state === "AT_STOPLINE" ||
    state === "STALLED"
  );
}

type OptionalVehicleField =
  | "scheduledEnterTick"
  | "admissionState"
  | "scheduledAdmissionOrder"
  | "scheduledBatchId"
  | "scheduledSlideTicks";

function restoreOptionalVehicleField<K extends OptionalVehicleField>(
  vehicle: Vehicle,
  key: K,
  value: Vehicle[K] | undefined,
): void {
  if (value === undefined) {
    delete vehicle[key];
    return;
  }
  vehicle[key] = value;
}
