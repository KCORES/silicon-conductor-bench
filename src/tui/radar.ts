import type {
  CompactObservation,
  Vehicle,
  VehicleState,
} from "../core/types.js";

export const LANE_ORDER = [
  "IN_N_L1_LEFT",
  "IN_N_S1_STRAIGHT",
  "IN_N_S2_STRAIGHT",
  "IN_N_R1_RIGHT",
  "IN_E_L1_LEFT",
  "IN_E_S1_STRAIGHT",
  "IN_E_S2_STRAIGHT",
  "IN_E_R1_RIGHT",
  "IN_S_L1_LEFT",
  "IN_S_S1_STRAIGHT",
  "IN_S_S2_STRAIGHT",
  "IN_S_R1_RIGHT",
  "IN_W_L1_LEFT",
  "IN_W_S1_STRAIGHT",
  "IN_W_S2_STRAIGHT",
  "IN_W_R1_RIGHT",
] as const;

export interface BenchLaneQueue {
  readonly laneId: string;
  readonly depth: number;
}

export interface BenchMemory {
  readonly phaseName: string;
  readonly targetTick: number;
  readonly isExpired: boolean;
  readonly depth: number;
}

export interface BenchRadar {
  readonly emergency: readonly string[];
  readonly stalls: readonly string[];
  readonly exits: readonly string[];
  readonly crosswalks: readonly string[];
  readonly upstream: readonly string[];
  readonly lanes: readonly BenchLaneQueue[];
  readonly memory: BenchMemory | null;
}

export function emptyRadar(): BenchRadar {
  return radarFrom(
    {
      currentTick: 0,
      financialBalance: 0,
      stoplineCandidates: [],
      blockedRoutes: [],
      candidateConflicts: [],
      candidateConflictScope: "STOPLINE_HEADS_SAME_TICK",
      lanePressureSignals: [],
      workingMemoryTop: null,
      emergencyAlerts: [],
      emergencyNotices: [],
      stalledVehicles: [],
      activeLaneHolds: [],
      exitHolds: [],
      crosswalkHolds: [],
      upstreamQueues: [],
    },
    [],
  );
}

export function radarFrom(
  observation: CompactObservation,
  vehicles: Iterable<Vehicle>,
): BenchRadar {
  const depths = new Map<string, number>();
  for (const vehicle of vehicles) {
    if (!isInbound(vehicle.state)) {
      continue;
    }
    depths.set(vehicle.inboundLaneId, (depths.get(vehicle.inboundLaneId) ?? 0) + 1);
  }
  return {
    emergency: observation.emergencyAlerts.map(
      (alert) =>
        `EE ${shortLane(alert.laneId)} q${alert.queueIndex} ${alert.vehicleId}`,
    ),
    stalls: observation.stalledVehicles.map(
      (stall) =>
        `XX ${shortLane(stall.laneId)} ${stall.vehicleId} behind ${stall.blockedBehindCount}`,
    ),
    exits: observation.exitHolds
      .filter((hold) => hold.occupied)
      .map((hold) => `## ${hold.laneId} until ${hold.blockedUntilTick}`),
    crosswalks: (observation.crosswalks ?? []).flatMap((crosswalk) =>
      crosswalk.directions.map((direction) => {
        const side = crosswalk.crosswalkId.replace("CROSSWALK:", "");
        const arrow = direction.direction === "A_TO_B" ? "A>B" : "B>A";
        const patience = direction.minPatienceRemaining ?? "-";
        return `PX ${side} ${arrow} w${direction.waiting} x${direction.crossing} p${patience} j${direction.jaywalking}`;
      }),
    ),
    upstream: observation.upstreamQueues.map(
      (queue) => `WAIT +${queue.waiting} ${shortLane(queue.laneId)}`,
    ),
    lanes: LANE_ORDER.map((laneId) => ({
      laneId,
      depth: depths.get(laneId) ?? 0,
    })),
    memory:
      observation.workingMemoryTop === null
        ? null
        : {
            phaseName: observation.workingMemoryTop.phaseName,
            targetTick: observation.workingMemoryTop.targetTick,
            isExpired: observation.workingMemoryTop.isExpired,
            depth: observation.workingMemoryTop.depth,
          },
  };
}

export function shortLane(laneId: string): string {
  const body = laneId.replace(/^(IN|OUT)_/, "");
  const [origin, index] = body.split("_");
  if (origin === undefined || index === undefined) {
    return laneId.slice(0, 8);
  }
  return `${origin}-${index}`;
}

function isInbound(state: VehicleState): boolean {
  return (
    state === "GENERATED" ||
    state === "APPROACHING" ||
    state === "QUEUED" ||
    state === "AT_STOPLINE" ||
    state === "STALLED"
  );
}
