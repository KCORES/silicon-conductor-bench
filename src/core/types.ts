import type { CatalogVehicleId } from "./vehicleRoster.generated.js";

export const DIRECTIONS = ["NORTH", "EAST", "SOUTH", "WEST"] as const;
export type Direction = (typeof DIRECTIONS)[number];

export const MANEUVERS = ["LEFT", "STRAIGHT", "RIGHT"] as const;
export type Maneuver = (typeof MANEUVERS)[number];

export const SPEED_PROFILES = ["SLOW_SLIDE", "CRUISE", "BURST"] as const;
export type SpeedProfile = (typeof SPEED_PROFILES)[number];

export type VehicleType = CatalogVehicleId | "MOTORCYCLE" | "SEDAN";
export type VehicleState =
  | "GENERATED"
  | "APPROACHING"
  | "QUEUED"
  | "AT_STOPLINE"
  | "CROSSING"
  | "ACCIDENT_STOPPED"
  | "EVACUATING"
  | "EXIT_BLOCKED"
  | "STALLED"
  | "OUTBOUND"
  | "DESPAWNED";

export type VehicleId = string;
export type PedestrianId = string;
export type ActorId = VehicleId | PedestrianId;
export type LaneId = string;
export type RouteId = string;
export type ConflictResourceId = string;
export type TickNumber = number;

export const PEDESTRIAN_DIRECTIONS = ["A_TO_B", "B_TO_A"] as const;
export type PedestrianDirection = (typeof PEDESTRIAN_DIRECTIONS)[number];

export type PedestrianState =
  | "APPROACHING"
  | "WAITING"
  | "CROSSING_RESERVED"
  | "CROSSING_JAYWALK"
  | "DEPARTING"
  | "INJURED"
  | "CLEARED";

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface CollisionVector {
  readonly x: number;
  readonly z: number;
}

export interface CollisionRestPose extends CollisionVector {
  readonly heading: number;
}

export interface VehicleCollisionOutcome {
  readonly vehicleId: VehicleId;
  readonly preImpactVelocity: CollisionVector;
  readonly impulse: CollisionVector;
  readonly restPose: CollisionRestPose;
  /** Contact point on this vehicle in simulation world coordinates. */
  readonly contactPoint: CollisionVector;
  /** Optional rendered-world contact point for model-accurate replay damage. */
  readonly visualContactPoint?: CollisionVector;
  readonly contactNormal: CollisionVector;
  readonly damageSeverity: IncidentSummary["severity"];
  /** Deterministic curb mass sampled from the vehicle class range. */
  readonly massKg: number;
  /** Relative kinetic energy in simulation velocity units. */
  readonly impactEnergy: number;
  /** Vehicle-space radius of the smooth impact deformation zone. */
  readonly dentRadius: number;
  /** Maximum inward displacement at the impact point. */
  readonly dentDepth: number;
  readonly deformation: number;
  readonly slideTicks: number;
  readonly hazardResourceIds: readonly ConflictResourceId[];
}

export interface PedestrianCollisionOutcome {
  readonly pedestrianId: PedestrianId;
  /** Contact point in simulation world coordinates. */
  readonly contactPoint?: CollisionVector;
  /** Surface normal pointing from the striking vehicle toward the pedestrian. */
  readonly contactNormal?: CollisionVector;
  /** Pedestrian velocity immediately before impact. */
  readonly preImpactVelocity?: CollisionVector;
  readonly impulse: CollisionVector;
  readonly restPose: CollisionRestPose;
  readonly fallDirection: number;
  /** Body mass used by the deterministic impact solver. */
  readonly massKg?: number;
  /** Relative kinetic energy in simulation velocity units. */
  readonly impactEnergy?: number;
  readonly slideTicks: number;
  /** Cells swept by the injured pedestrian before coming to rest. */
  readonly hazardResourceIds?: readonly ConflictResourceId[];
}

export interface CollisionOutcome {
  readonly impactTick: TickNumber;
  readonly resourceId: ConflictResourceId;
  readonly contactPoint: CollisionVector;
  readonly collisionType: IncidentSummary["collisionType"];
  readonly severity: IncidentSummary["severity"];
  readonly vehicles: readonly VehicleCollisionOutcome[];
  readonly pedestrians: readonly PedestrianCollisionOutcome[];
}

export interface TrajectorySlot extends Point {
  readonly slotId: string;
  readonly index: number;
  readonly conflictResourceIds: readonly ConflictResourceId[];
  readonly controlResourceIds: readonly ConflictResourceId[];
}

export interface Trajectory {
  readonly id: RouteId;
  readonly origin: Direction;
  readonly destination: Direction;
  readonly maneuver: Maneuver;
  readonly inboundLaneId: LaneId;
  readonly outboundLaneId: LaneId;
  /** Base demand route whose intent this optional guidance route preserves. */
  readonly guidanceForRouteId?: RouteId;
  readonly slots: readonly TrajectorySlot[];
}

export interface Lane {
  readonly id: LaneId;
  readonly direction: Direction;
  readonly kind: "INBOUND" | "OUTBOUND";
  readonly capacitySlots: number;
  readonly anchor: Point;
  readonly routeId?: RouteId;
}

export interface CrosswalkZone {
  readonly id: ConflictResourceId;
  readonly approach: Direction;
  readonly start: Point;
  readonly end: Point;
  readonly cells: readonly CrosswalkCell[];
  readonly waitingAreas: readonly PedestrianWaitingArea[];
}

export interface CrosswalkCell extends Point {
  readonly id: string;
  readonly crosswalkId: ConflictResourceId;
  readonly column: number;
  readonly row: 0 | 1;
  readonly conflictResourceId: ConflictResourceId;
  readonly vehicleSlotIds: readonly string[];
}

export type PedestrianCornerCellKind = "WAITING_ZONE" | "SIDEWALK_QUEUE";

export interface PedestrianCornerCell extends Point {
  readonly id: string;
  readonly cornerId: string;
  readonly latticeX: number;
  readonly latticeY: number;
  readonly kind: PedestrianCornerCellKind;
}

export interface PedestrianCornerEntrance extends Point {
  readonly id: string;
  readonly cornerId: string;
  readonly latticeX: number;
  readonly latticeY: number;
}

export interface PedestrianCorner {
  readonly id: string;
  readonly cells: readonly PedestrianCornerCell[];
  readonly entrances: readonly PedestrianCornerEntrance[];
}

export interface PedestrianWaitingArea {
  readonly id: string;
  readonly crosswalkId: ConflictResourceId;
  readonly direction: PedestrianDirection;
  readonly cornerId: string;
  readonly entryCellId: string;
  readonly cells: readonly PedestrianCornerCell[];
}

export interface PedestrianApproachCell extends Point {
  readonly id: string;
  readonly pathId: string;
  readonly index: number;
}

export interface PedestrianApproachPath {
  readonly id: string;
  readonly crosswalkId: ConflictResourceId;
  readonly direction: PedestrianDirection;
  readonly cornerId: string;
  readonly targetWaitingCellId: string;
  readonly cells: readonly PedestrianApproachCell[];
}

export interface RoadNetwork {
  readonly inboundLanes: ReadonlyMap<LaneId, Lane>;
  readonly outboundLanes: ReadonlyMap<LaneId, Lane>;
  readonly trajectories: ReadonlyMap<RouteId, Trajectory>;
  readonly crosswalks: ReadonlyMap<ConflictResourceId, CrosswalkZone>;
  readonly pedestrianCorners: ReadonlyMap<string, PedestrianCorner>;
  readonly pedestrianApproachPaths: ReadonlyMap<string, PedestrianApproachPath>;
}

export interface Vehicle {
  readonly id: VehicleId;
  readonly type: VehicleType;
  readonly lengthSlots: number;
  readonly intentRouteId: RouteId;
  inboundLaneId: LaneId;
  outboundLaneId: LaneId;
  routeId: RouteId;
  state: VehicleState;
  inboundHeadSlot: number;
  trajectoryHeadSlot: number;
  outboundHeadSlot: number;
  waitingTicks: number;
  stationaryTicks: number;
  generatedAtTick: TickNumber;
  admittedAtTick?: TickNumber;
  despawnedAtTick?: TickNumber;
  startupLagRemaining: number;
  slowMovesDone: number;
  slowPhase: number;
  speedProfile: SpeedProfile;
  motionCreditHalfSlots: number;
  encroaching: boolean;
  stallChecked: boolean;
  stallBlockedTicks: number;
  admissionState?: "SCHEDULED_ENTERING";
  scheduledEnterTick?: TickNumber;
  scheduledAdmissionOrder?: number;
  scheduledBatchId?: string;
  scheduledSlideTicks?: number;
  incidentId?: string;
  /** Stationary ticks this driver tolerates on the inbound lane before acting out. */
  driverPatienceLimit: number;
  /** Cumulative inbound ticks without forward progress; never reset by creeping. */
  driverWaitTicks: number;
  violation?: VehicleViolation;
}

export type VehicleViolation = "RED_LIGHT" | "TAILGATE" | "CUT_IN";

export interface Pedestrian {
  readonly id: PedestrianId;
  readonly crosswalkId: ConflictResourceId;
  readonly direction: PedestrianDirection;
  readonly generatedAtTick: TickNumber;
  readonly patienceLimit: number;
  state: PedestrianState;
  waitingTicks: number;
  approachPathId?: string;
  approachIndex?: number;
  approachCellId?: string;
  targetWaitingCellId?: string;
  targetWaitingSubslot?: number;
  waitingStartedTick?: TickNumber;
  waitingCellId?: string;
  waitingSubslot?: number;
  row?: 0 | 1;
  column?: number;
  cohortId?: string;
  scheduledStartTick?: TickNumber;
  nextMoveTick?: TickNumber;
  incidentId?: string;
}

export type ReservationTable = Map<
  TickNumber,
  Map<ConflictResourceId, ActorId>
>;

export type AdmissionRejectionReason =
  | "DUPLICATE_REQUEST"
  | "UNKNOWN_VEHICLE"
  | "NOT_AT_STOPLINE"
  | "NOT_LANE_HEAD"
  | "UNKNOWN_ROUTE"
  | "LANE_ROUTE_MISMATCH"
  | "MANEUVER_NOT_PERMITTED"
  | "RESOURCE_CONFLICT"
  | "ROUTE_SEVERED"
  | "LANE_HELD"
  | "EXIT_FULL"
  | "CROSSWALK"
  | "STALLED"
  | "BATCH_ABORTED";

export interface AdmissionResult {
  readonly vehicleId: VehicleId;
  readonly status: "ADMITTED" | "SAFETY_REJECTED";
  readonly reason?: AdmissionRejectionReason;
  readonly conflictingVehicleId?: VehicleId;
  readonly conflictingTick?: TickNumber;
  readonly conflictingResourceId?: ConflictResourceId;
}

export interface AdmissionBatchResult {
  readonly tick: TickNumber;
  readonly results: readonly AdmissionResult[];
  readonly admittedVehicleIds: readonly VehicleId[];
  readonly rejectedVehicleIds: readonly VehicleId[];
  readonly enterPlan?: readonly PlannedAdmissionEntry[];
}

export interface LaneBatchRequest {
  readonly laneId: LaneId;
  readonly topN: number;
  readonly speedProfile?: SpeedProfile;
}

export interface VehicleSpeedProfileRequest {
  readonly vehicleId: VehicleId;
  readonly speedProfile: SpeedProfile;
}

export interface PlannedAdmissionEntry {
  readonly vehicleId: VehicleId;
  readonly laneId: LaneId;
  readonly enterTick: TickNumber;
  readonly scheduled: boolean;
  readonly speedProfile: SpeedProfile;
  readonly rolling?: boolean;
  readonly batchId?: string;
}

export interface DischargingLane {
  readonly laneId: LaneId;
  readonly remainingVehicles: number;
  readonly nextEnterTick: TickNumber;
  readonly estimatedClearTick: TickNumber;
}

export interface ActiveVehicleMotionView {
  readonly vehicleId: VehicleId;
  readonly routeId: RouteId;
  readonly state: "CROSSING" | "EXIT_BLOCKED" | "SCHEDULED_ENTERING";
  readonly speedProfile: SpeedProfile;
  readonly scheduledEnterTick?: TickNumber;
}

export interface StoplineCandidate {
  readonly vehicleId: VehicleId;
  readonly type: VehicleType;
  readonly lane: LaneId;
  readonly waitingTicks: number;
  readonly routeId: RouteId;
  readonly intentRouteId?: RouteId;
}

export interface BlockedRoute {
  readonly routeId: RouteId;
  readonly blockedUntilTick: TickNumber;
  /** Missing on schema-v1 replays; treat an absent value as RESERVATION. */
  readonly blockKind?: "RESERVATION" | "INCIDENT";
  readonly incidentIds?: readonly string[];
}

export interface CandidateConflict {
  readonly vehicleIdA: VehicleId;
  readonly vehicleIdB: VehicleId;
}

export interface LanePressureSignal {
  readonly laneId: LaneId;
  readonly queuedVehicles: number;
  /** Billing units (passengers, heavy-truck cargo) of the queued vehicles. */
  readonly queuedPassengers?: number;
  readonly capacityOccupancy: number;
}

/** A vehicle laid out on a lane; `headIndex` counts from the junction-side end of the lane. */
export interface LaneSlotVehicle {
  readonly vehicleId: VehicleId;
  readonly type: VehicleType;
  readonly headIndex: number;
  readonly lengthSlots: number;
  readonly scheduled: boolean;
}

export interface LaneSlotView {
  readonly laneId: LaneId;
  readonly capacitySlots: number;
  readonly vehicles: readonly LaneSlotVehicle[];
}

export type CrosswalkCellMark = "c" | "j" | "x" | "v";

export interface CrosswalkCellView {
  readonly row: 0 | 1;
  readonly column: number;
  readonly mark: CrosswalkCellMark;
}

export interface CrosswalkSlotView {
  readonly crosswalkId: ConflictResourceId;
  readonly columns: number;
  readonly cells: readonly CrosswalkCellView[];
  /** Last tick at which any vehicle reservation (now or later) still covers a cell of this crosswalk. */
  readonly vehicleReservedUntil?: TickNumber;
}

export interface CrosswalkReservationView {
  readonly crosswalkId: ConflictResourceId;
  readonly columns: number;
  /** Earliest vehicle-reserved tick offset per crosswalk cell inside the horizon. */
  readonly cells: readonly {
    readonly row: 0 | 1;
    readonly column: number;
    readonly tickOffset: number;
  }[];
}

export interface SpatialSnapshot {
  readonly inbound: readonly LaneSlotView[];
  readonly outbound: readonly LaneSlotView[];
  readonly crosswalks: readonly CrosswalkSlotView[];
}

export interface JunctionCellVehicle extends Point {
  readonly vehicleId: VehicleId;
  readonly type: VehicleType;
  readonly head: boolean;
}

export interface JunctionVehicleView {
  readonly vehicleId: VehicleId;
  readonly type: VehicleType;
  readonly routeId: RouteId;
  readonly state: VehicleState;
  readonly speedProfile: SpeedProfile;
  readonly enterTick?: TickNumber;
  /** Last tick that still holds a reservation for this vehicle. */
  readonly reservedUntilTick?: TickNumber;
  /** The vehicle sits on cells its reservation no longer covers this tick. */
  readonly stale: boolean;
}

export interface JunctionSnapshot {
  readonly tick: TickNumber;
  readonly horizonTicks: number;
  readonly minCoordinate: number;
  readonly maxCoordinate: number;
  readonly routedCells: readonly Point[];
  readonly vehicleCells: readonly JunctionCellVehicle[];
  readonly lockedCells: readonly Point[];
  readonly pedestrianCells: readonly Point[];
  /** Earliest reserved tick offset per SPACE cell inside the horizon. */
  readonly reservedCells: readonly (Point & { readonly tickOffset: number })[];
  readonly crosswalkReservations: readonly CrosswalkReservationView[];
  readonly vehicles: readonly JunctionVehicleView[];
}

export interface LaneQueueVehicle {
  readonly id: VehicleId;
  readonly type: VehicleType;
  readonly waitTicks: number;
  readonly state: VehicleState;
  readonly routeId: RouteId;
  readonly distanceToStopline: number;
  readonly validGuidanceTargetLaneIds: readonly LaneId[];
}

export interface LaneQueueInspection {
  readonly laneId: LaneId;
  readonly totalQueued: number;
  readonly capacityOccupancy: number;
  readonly maxWaitTicks: number;
  readonly vehiclesBehind: readonly LaneQueueVehicle[];
}

export interface LaneGuidancePermit {
  readonly vehicleId: VehicleId;
  readonly sourceLaneId: LaneId;
  readonly targetLaneId: LaneId;
  readonly intentRouteId: RouteId;
  readonly guidedRouteId: RouteId;
  readonly grantedAtTick: TickNumber;
}

export type AdmissionRevocationReason =
  | "LANE_TRANSFER"
  | "HEAD_UNSCHEDULED"
  | "SLIDE_LIMIT"
  | "JAYWALKER_AHEAD"
  | "RED_LIGHT_RUNNER"
  | "TAILGATER";

export interface AdmissionRevocation {
  readonly tick: TickNumber;
  readonly laneId: LaneId;
  readonly vehicleIds: readonly VehicleId[];
  readonly reason: AdmissionRevocationReason;
}

export interface JaywalkerExposure {
  readonly vehicleId: VehicleId;
  readonly crosswalkId: ConflictResourceId;
  readonly pedestrianIds: readonly PedestrianId[];
}

export interface LaneTransferRecord {
  readonly vehicleId: VehicleId;
  readonly intentRouteId: RouteId;
  readonly routeId: RouteId;
}

export interface LaneGuidanceOpportunity {
  readonly sourceLaneId: LaneId;
  readonly targetLaneId: LaneId;
  readonly eligibleVehicleIds: readonly VehicleId[];
  readonly sourceOccupancy: number;
  readonly targetOccupancy: number;
}

export interface WorkingMemoryTop {
  readonly phaseName: string;
  readonly targetTick: TickNumber;
  readonly isExpired: boolean;
  readonly depth: number;
}

export interface CompactObservation {
  readonly currentTick: TickNumber;
  readonly financialBalance: number;
  readonly stoplineCandidates: readonly StoplineCandidate[];
  readonly blockedRoutes: readonly BlockedRoute[];
  readonly candidateConflicts: readonly CandidateConflict[];
  readonly candidateConflictScope: "STOPLINE_HEADS_SAME_TICK";
  readonly dischargingLanes?: readonly DischargingLane[];
  readonly revokedAdmissions?: readonly AdmissionRevocation[];
  readonly activeVehicleMotions?: readonly ActiveVehicleMotionView[];
  readonly lanePressureSignals: readonly LanePressureSignal[];
  readonly workingMemoryTop: WorkingMemoryTop | null;
  readonly interruptReason?: string;
  readonly emergencyAlerts: readonly EmergencyAlert[];
  readonly emergencyNotices: readonly EmergencyNotice[];
  readonly stalledVehicles: readonly StalledVehicleView[];
  readonly activeLaneHolds: readonly ActiveLaneHoldView[];
  readonly exitHolds: readonly HoldView[];
  readonly crosswalkHolds: readonly HoldView[];
  readonly upstreamQueues: readonly UpstreamQueueView[];
  readonly crosswalks?: readonly CrosswalkPedestrianSummary[];
  readonly pedestrianAlerts?: readonly PedestrianAlert[];
  readonly driverAlerts?: readonly DriverAlert[];
  readonly laneGuidanceOpportunities?: readonly LaneGuidanceOpportunity[];
  readonly activeLaneGuidancePermits?: readonly LaneGuidancePermit[];
}

export interface CrosswalkDirectionSummary {
  readonly direction: PedestrianDirection;
  readonly approaching: number;
  readonly waiting: number;
  readonly waitingCapacity?: number;
  readonly externalBacklog?: number;
  readonly crossing: number;
  readonly minPatienceRemaining: number | null;
  readonly clearTick: TickNumber | null;
  readonly jaywalking: number;
}

export interface CrosswalkPedestrianSummary {
  readonly crosswalkId: ConflictResourceId;
  readonly phaseBatchCap?: number;
  readonly warningRemainingTicks?: number;
  readonly directions: readonly CrosswalkDirectionSummary[];
}

export type PedestrianAlertKind =
  | "PATIENCE_CRITICAL"
  | "JAYWALKING";

export interface PedestrianAlert {
  readonly pedestrianId: PedestrianId;
  readonly crosswalkId: ConflictResourceId;
  readonly direction: PedestrianDirection;
  readonly kind: PedestrianAlertKind;
  readonly patienceRemaining: number;
}

export type DriverTemperamentView = "AGGRESSIVE" | "NORMAL" | "CALM";

/** A follower that would tailgate behind the last vehicle released on its lane. */
export interface TailgateRisk {
  readonly vehicleId: VehicleId;
  readonly laneId: LaneId;
  readonly behindVehicleId: VehicleId;
}

/** An inbound driver close to running out of patience. */
export interface DriverAlert {
  readonly vehicleId: VehicleId;
  readonly laneId: LaneId;
  readonly distanceToStopline: number;
  readonly temperament: DriverTemperamentView;
  readonly patienceRemaining: number;
}

export interface PedestrianPhaseRequest {
  readonly crosswalkId: ConflictResourceId;
  readonly directions: readonly PedestrianDirection[];
}

export interface PedestrianCohortPreview {
  readonly crosswalkId: ConflictResourceId;
  readonly directions: readonly PedestrianDirection[];
  readonly pedestrianIds: readonly PedestrianId[];
  readonly clearTick: TickNumber;
}

export type PedestrianEventKind =
  | "PED_SPAWN"
  | "PED_GRANT"
  | "PED_JAYWALK"
  | "PED_CLEAR"
  | "PED_COLLISION";

export interface PedestrianEvent {
  readonly kind: PedestrianEventKind;
  readonly tick: TickNumber;
  readonly pedestrianIds: readonly PedestrianId[];
  readonly crosswalkId: ConflictResourceId;
  readonly directions?: readonly PedestrianDirection[];
  readonly cohortId?: string;
  readonly incidentId?: string;
  readonly resourceId?: ConflictResourceId;
}

export interface PedestrianEconomyRates {
  readonly delayPerTick: number;
  readonly waitingGraceTicks: number;
  readonly completionReward: number;
  readonly jaywalkWavePenalty: number;
  readonly jaywalkerPenalty: number;
  readonly collisionPenalty: number;
}

export interface PedestrianSettlement {
  readonly waitingPedestrians: number;
  readonly completedPedestrians: number;
  readonly jaywalkWaves: number;
  readonly firstJaywalks: number;
  readonly collisionInjuries: number;
  readonly delayCost: number;
  readonly completionRevenue: number;
  readonly jaywalkCost: number;
  readonly collisionCost: number;
}

export interface ScheduleConflict {
  readonly actorIds: readonly ActorId[];
  readonly tick: TickNumber;
  readonly resourceId: ConflictResourceId;
}

export interface ActiveLaneHoldView {
  readonly laneId: LaneId;
  readonly routeId: RouteId;
  readonly incidentId: string;
  readonly sinceTick: TickNumber;
  readonly autoRelease: "ACCIDENT_CLEARED";
}

export interface EmergencyAlert {
  readonly vehicleId: VehicleId;
  readonly laneId: string;
  readonly queueIndex: number;
  readonly blockingVehicleIds: readonly VehicleId[];
  readonly delayBleedPerTick: number;
  readonly distanceToStopline: number;
  readonly stationaryTicks: number;
  readonly chargeActive: boolean;
}

export type EmergencyNoticeKind = "OUTSIDE_HORIZON" | "ENTERED_HORIZON";

export interface EmergencyNotice {
  readonly vehicleId: VehicleId;
  readonly laneId: string;
  readonly distanceToStopline: number;
  readonly kind: EmergencyNoticeKind;
  readonly surchargeActive: boolean;
}

export interface StalledVehicleView {
  readonly vehicleId: VehicleId;
  readonly laneId: string;
  readonly routeId: RouteId;
  readonly blockedBehindCount: number;
  readonly validBypassLanes: readonly RouteId[];
  readonly bypassAvailability: readonly StallBypassAvailability[];
  readonly towTask?: {
    readonly status: "EN_ROUTE";
    readonly completionTick: TickNumber;
    readonly remainingTicks: number;
    readonly cost: number;
  };
}

export interface StallBypassAvailability {
  readonly routeId: RouteId;
  readonly laneId: LaneId;
  readonly maxMovableVehicles: number;
  readonly blockingVehicleId?: VehicleId;
  readonly blockedSlot?: number;
  readonly unsupportedVehicleId?: VehicleId;
}

export interface HoldView {
  readonly laneId: string;
  readonly occupied: boolean;
  readonly blockedUntilTick: TickNumber;
}

export interface UpstreamQueueView {
  readonly laneId: string;
  readonly waiting: number;
}

export interface DryRunConflict {
  readonly tickOffset: number;
  readonly conflictResourceId: ConflictResourceId;
  readonly conflictingVehicles: readonly VehicleId[];
}

export interface DryRunAdmissionResult {
  readonly feasible: boolean;
  readonly conflictDetected?: DryRunConflict;
  readonly estimatedFlowReward: number;
  readonly batch: AdmissionBatchResult;
  readonly enterPlan?: readonly PlannedAdmissionEntry[];
}

export interface DecisionMetrics {
  readonly wallClockLatencyMs: number;
  readonly promptTokens?: number;
  readonly completionTokens?: number;
}

export interface VehicleDespawnEvent {
  readonly vehicleId: VehicleId;
  readonly vehicleType: VehicleType;
  readonly totalTravelTicks: number;
  readonly tick: TickNumber;
  readonly violation?: VehicleViolation;
}

export interface WorldSnapshot {
  readonly tick: TickNumber;
  readonly vehicles: readonly Readonly<Vehicle>[];
  readonly pedestrians: readonly Readonly<Pedestrian>[];
  readonly externalPedestrianBacklog?: readonly {
    readonly id: string;
    readonly tick: TickNumber;
    readonly slot: number;
    readonly crosswalkId: ConflictResourceId;
    readonly direction: PedestrianDirection;
  }[];
  readonly activeReservationTicks: readonly TickNumber[];
  readonly activeLaneGuidancePermits?: readonly LaneGuidancePermit[];
  readonly upstreamQueues: readonly {
    readonly laneId: LaneId;
    readonly arrivals: readonly {
      readonly tick: TickNumber;
      readonly slot: number;
      readonly routeId: RouteId;
      readonly type: VehicleType;
    }[];
  }[];
}

export interface IncidentSummary {
  readonly id: string;
  readonly triggerTick: TickNumber;
  readonly status: "OPEN" | "CLOSED";
  readonly collisionType:
    | "SCRAPE"
    | "REAR_END"
    | "ANGLE_COLLISION"
    | "PILEUP";
  readonly severity: "MINOR" | "MODERATE" | "SERIOUS" | "CRITICAL";
  readonly vehicleIds: readonly VehicleId[];
  readonly pedestrianIds: readonly PedestrianId[];
  readonly lockedResourceIds: readonly ConflictResourceId[];
  readonly severedRouteIds: readonly RouteId[];
  readonly suggestedEvacLanes: readonly LaneId[];
  readonly activeLaneHolds: readonly ActiveLaneHoldView[];
  readonly estimatedClearanceTicks: number;
  readonly secondaryCollisionRisk: boolean;
  readonly clearanceLatencyTicks?: number;
  readonly collisionOutcomes?: readonly CollisionOutcome[];
}

export interface IncidentLogEntry {
  readonly kind:
    | "ACCIDENT"
    | "SECONDARY_ACCIDENT"
    | "ACCIDENT_INTERRUPT"
    | "EVACUATION"
    | "LANE_DETOUR"
    | "SECONDARY_REJECT"
    | "ACCIDENT_CLEARED"
    | "CONVOY"
    | "STALL"
    | "STALL_REROUTE"
    | "LANE_GUIDANCE"
    | "TOW_DISPATCH"
    | "TOW_COMPLETE"
    | "ADMISSION_REVOKED"
    | "ADMISSION_EXPIRED";
  readonly tick: TickNumber;
  readonly incidentId?: string;
  readonly reason?: AdmissionRevocationReason;
  readonly transfers?: readonly LaneTransferRecord[];
  readonly vehicleIds?: readonly VehicleId[];
  readonly pedestrianIds?: readonly PedestrianId[];
  readonly lockedResourceIds?: readonly ConflictResourceId[];
  readonly interruptReason?: string;
  readonly targetEvacLane?: LaneId;
  readonly action?:
    | "HOLD_AT_STOPLINE"
    | "RELEASE_AT_STOPLINE"
    | "DIVERT_TO_ADJACENT_LANE";
  readonly laneId?: LaneId;
  readonly targetRouteId?: RouteId;
  readonly sourceLaneId?: LaneId;
  readonly targetLaneId?: LaneId;
  readonly intentRouteId?: RouteId;
  readonly guidedRouteId?: RouteId;
  readonly vehicleId?: VehicleId;
  readonly routeId?: RouteId;
  readonly clearanceLatencyTicks?: number;
  readonly collisionType?: IncidentSummary["collisionType"];
  readonly severity?: IncidentSummary["severity"];
  readonly estimatedClearanceTicks?: number;
  readonly collisionOutcomes?: readonly CollisionOutcome[];
  readonly completionTick?: TickNumber;
  readonly cost?: number;
}
