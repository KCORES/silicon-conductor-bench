import type {
  CompactObservation,
  Direction,
  PedestrianDirection,
  PedestrianState,
  SpeedProfile,
  VehicleState,
  VehicleType,
  VehicleViolation,
} from "../core/types.js";

export interface ReplayIdentity {
  readonly model: string;
  readonly testDate: string;
  readonly postfix: string;
}

export const REPLAY_SCHEMA_VERSION = 7;
export const SIMULATION_RULES_VERSION = 19;

export interface ReplayVec2 {
  readonly x: number;
  readonly z: number;
}

export interface ReplayPose extends ReplayVec2 {
  readonly heading: number;
  readonly slotKey?: string;
  readonly conflictResourceIds?: readonly string[];
}

export type ReplayScorePhase = "charging" | "settled";

export interface ReplayVehiclePose extends ReplayPose {
  readonly id: string;
  readonly type: VehicleType;
  readonly state: VehicleState;
  readonly routeId: string;
  readonly inboundLaneId: string;
  readonly outboundLaneId: string;
  readonly waitingTicks: number;
  readonly incidentId?: string;
  readonly admissionState?: "SCHEDULED_ENTERING";
  readonly violation?: VehicleViolation;
  /** Optional paint override used by isolated visual demos. */
  readonly paintHex?: string;
  /** Optional visual arc progress used by deterministic replay demos. */
  readonly turnPathProgress?: number;
  readonly segments: readonly ReplayPose[];
  readonly score?: number;
  readonly scorePhase?: ReplayScorePhase;
}

export interface ReplayPedestrianPose extends ReplayPose {
  readonly id: string;
  readonly crosswalkId: string;
  readonly direction: PedestrianDirection;
  readonly state: PedestrianState;
  readonly waitingTicks: number;
  readonly patienceLimit: number;
  readonly incidentId?: string;
  readonly row?: 0 | 1;
  readonly column?: number;
  readonly cohortId?: string;
  readonly waitingCellId?: string;
  readonly waitingSubslot?: number;
  readonly approachCellId?: string;
  readonly approachPathId?: string;
  readonly approachIndex?: number;
  readonly worldSpace?: boolean;
  readonly score?: number;
  readonly scorePhase?: ReplayScorePhase;
}

export interface ReplayFrame {
  readonly tick: number;
  readonly phase: "tick" | "decision";
  readonly vehicles: readonly ReplayVehiclePose[];
  /** Required by schema 5 recordings. */
  readonly pedestrians?: readonly ReplayPedestrianPose[];
  readonly financialBalance?: number;
}

export type ReplayEventKind =
  | "SPAWN"
  | "DECISION_START"
  | "MODEL_RESPONSE"
  | "TOOL_CALL"
  | "TOOL_RESULT"
  | "DRY_RUN_ADMIT"
  | "COMMIT"
  | "ADMIT"
  | "REJECT"
  | "DESPAWN"
  | "FALLBACK"
  | "PROTOCOL_WARNING"
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
  | "TOW_DISPATCH"
  | "TOW_COMPLETE"
  | "LANE_GUIDANCE"
  | "ADMISSION_REVOKED"
  | "ADMISSION_EXPIRED"
  | "PED_SPAWN"
  | "PED_GRANT"
  | "PED_JAYWALK"
  | "PED_CLEAR"
  | "PED_COLLISION";

export interface ReplayDryRunCandidate {
  readonly vehicleId: string;
  readonly routeId: string;
  readonly enterTickOffset?: number;
  readonly speedProfile?: SpeedProfile;
}

export interface ReplayReservationStep {
  readonly tickOffset: number;
  readonly resourceIds: readonly string[];
}

export interface ReplayReservationPreview {
  readonly vehicleId: string;
  readonly routeId: string;
  readonly enterTick: number;
  readonly speedProfile?: SpeedProfile;
  readonly steps: readonly ReplayReservationStep[];
}

export interface ReplayConflictMarker extends ReplayVec2 {
  readonly conflictResourceId: string;
  readonly conflictingVehicleIds: readonly string[];
  readonly tickOffset?: number;
}

export interface ReplayEvent {
  readonly id: string;
  readonly kind: ReplayEventKind;
  readonly tick: number;
  readonly cycle?: number;
  readonly sequence: number;
  readonly payload: unknown;
}

export interface ReplayDryRunPayload {
  readonly vehicleIds: readonly string[];
  readonly candidates: readonly ReplayDryRunCandidate[];
  readonly feasible: boolean;
  readonly reward?: number;
  readonly conflict?: ReplayConflictMarker;
  readonly reservationPreview?: readonly ReplayReservationPreview[];
}

export interface ReplayDecisionCycle {
  readonly cycle: number;
  readonly decisionTick: number;
  readonly commitTick: number;
  readonly sleepTicks: number;
  readonly physicsEndTick: number;
  readonly usedFallback: boolean;
  readonly tacticalSummary: string;
  readonly admittedVehicleIds: readonly string[];
  readonly rejectedVehicleIds: readonly string[];
  readonly financialBalance: number;
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly observation: CompactObservation;
}

export interface ReplayLaneGeometry {
  readonly id: string;
  readonly kind: "INBOUND" | "OUTBOUND" | "TRAJECTORY";
  readonly routeId?: string;
  readonly direction?: Direction;
  readonly slots: readonly ReplayPose[];
}

export interface ReplayCrosswalkGeometry {
  readonly id: string;
  readonly approach: Direction;
  readonly start: ReplayVec2;
  readonly end: ReplayVec2;
  /** Required by schema 5 scenes. */
  readonly cells?: readonly ReplayCrosswalkCellGeometry[];
  /** Required by schema 5 scenes and backed by shared corner IDs. */
  readonly waitingAreas?: readonly ReplayPedestrianWaitingAreaGeometry[];
}

export interface ReplayCrosswalkCellGeometry extends ReplayVec2 {
  readonly id: string;
  readonly conflictResourceId: string;
  readonly column: number;
  readonly row: 0 | 1;
}

export interface ReplayPedestrianWaitingCellGeometry extends ReplayVec2 {
  readonly id: string;
  readonly latticeX: number;
  readonly latticeZ: number;
  readonly kind: "WAITING_ZONE" | "SIDEWALK_QUEUE";
  readonly worldSpace: true;
}

export interface ReplayPedestrianWaitingAreaGeometry {
  readonly id: string;
  readonly direction: PedestrianDirection;
  readonly cornerId?: string;
  readonly entryCellId?: string;
  readonly entry?: ReplayVec2 & {
    readonly id: string;
    readonly worldSpace: true;
  };
  readonly cells: readonly ReplayPedestrianWaitingCellGeometry[];
}

export interface ReplayPedestrianCornerGeometry {
  readonly id: string;
  readonly cells: readonly ReplayPedestrianWaitingCellGeometry[];
  readonly entrances: readonly (ReplayVec2 & {
    readonly id: string;
    readonly latticeX: number;
    readonly latticeZ: number;
    readonly worldSpace: true;
  })[];
}

export interface ReplayPedestrianApproachPathGeometry {
  readonly id: string;
  readonly crosswalkId: string;
  readonly direction: PedestrianDirection;
  readonly cornerId: string;
  readonly targetWaitingCellId: string;
  readonly cells: readonly (ReplayVec2 & {
    readonly id: string;
    readonly index: number;
    readonly worldSpace: true;
  })[];
}

export interface ReplayScene {
  readonly inboundLanes: readonly ReplayLaneGeometry[];
  readonly outboundLanes: readonly ReplayLaneGeometry[];
  readonly trajectories: readonly ReplayLaneGeometry[];
  readonly crosswalks: readonly ReplayCrosswalkGeometry[];
  /** Required by schema 5 scenes. */
  readonly pedestrianCorners?: readonly ReplayPedestrianCornerGeometry[];
  readonly pedestrianApproachPaths?: readonly ReplayPedestrianApproachPathGeometry[];
  readonly conflictResources: Readonly<Record<string, ReplayVec2>>;
}

export interface ReplayBundle {
  readonly schemaVersion: number;
  readonly simulationRulesVersion?: number;
  readonly tickDurationMs: number;
  readonly warmupTicks: number;
  readonly totalTicks: number;
  readonly identity: ReplayIdentity;
  readonly model: string;
  readonly seed: number;
  readonly scene: ReplayScene;
  readonly frames: readonly ReplayFrame[];
  readonly events: readonly ReplayEvent[];
  readonly cycles: readonly ReplayDecisionCycle[];
}
