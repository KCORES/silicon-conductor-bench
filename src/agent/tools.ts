import type OpenAI from "openai";
import { z } from "zod";
import { SimulationEngine } from "../core/engine.js";
import { vehicleOccupationTimeline } from "../core/safety.js";
import type {
  AdmissionBatchResult,
  JunctionSnapshot,
  LaneBatchRequest,
  PedestrianPhaseRequest,
  SpeedProfile,
  Vehicle,
  VehicleSpeedProfileRequest,
} from "../core/types.js";
import { rewardTollForVehicle } from "../core/vehicleRoster.js";
import { AgentMetricsCollector } from "./metrics.js";
import { crosswalkKey, speedProfileLetter } from "./model-observation.js";
import {
  encodeCrosswalkReservations,
  encodeJunctionOccupancy,
  encodeJunctionReservations,
  encodeLockGrid,
  vehicleLetter,
} from "./spatial-encoding.js";
import { WorkingMemoryStack } from "./working-memory.js";

export const DRY_RUN_ADMIT = "dry_run_admit";
export const INSPECT_LANE_QUEUE = "inspect_lane_queue";
export const INSPECT_CROSSWALK = "inspect_crosswalk";
export const INSPECT_INCIDENT = "inspect_incident";
export const INSPECT_JUNCTION = "inspect_junction";
export const ORDER_ACCIDENT_CLEARANCE = "order_accident_clearance";
export const SET_LANE_DETOUR = "set_lane_detour";
export const DISPATCH_EMERGENCY_CONVOY = "dispatch_emergency_convoy";
export const REROUTE_QUEUE_AROUND_STALL = "reroute_queue_around_stall";
export const GUIDE_INBOUND_LANE_CHANGE = "guide_inbound_lane_change";
export const DISPATCH_TOW_TRUCK = "dispatch_tow_truck";
export const MANAGE_WORKING_MEMORY = "manage_working_memory";
export const COMMIT_SCHEDULE = "commit_schedule";

export type AgentToolName =
  | typeof DRY_RUN_ADMIT
  | typeof INSPECT_LANE_QUEUE
  | typeof INSPECT_CROSSWALK
  | typeof INSPECT_INCIDENT
  | typeof INSPECT_JUNCTION
  | typeof ORDER_ACCIDENT_CLEARANCE
  | typeof SET_LANE_DETOUR
  | typeof DISPATCH_EMERGENCY_CONVOY
  | typeof REROUTE_QUEUE_AROUND_STALL
  | typeof GUIDE_INBOUND_LANE_CHANGE
  | typeof DISPATCH_TOW_TRUCK
  | typeof MANAGE_WORKING_MEMORY
  | typeof COMMIT_SCHEDULE;

const vehicleIdsSchema = z.array(z.string().min(1)).max(16);
const speedProfileSchema = z.enum(["SLOW_SLIDE", "CRUISE", "BURST"]);
const laneBatchSchema = z.object({
  lane_id: z.string().min(1),
  top_n: z.number().int().min(1).max(8),
  speed_profile: speedProfileSchema.optional(),
});
const vehicleSpeedProfileSchema = z.object({
  vehicle_id: z.string().min(1),
  speed_profile: speedProfileSchema,
});
const pedestrianPhaseSchema = z.object({
  crosswalk_id: z.string().min(1),
  directions: z
    .array(z.enum(["A_TO_B", "B_TO_A"]))
    .min(1)
    .max(2),
});

function requireAdmissionSource(
  value: {
    candidate_vehicle_ids?: readonly string[];
    admit_vehicle_ids?: readonly string[];
    lane_batches: readonly { lane_id: string; top_n: number }[];
    vehicle_speed_profiles: readonly { vehicle_id: string }[];
    pedestrian_phases: readonly unknown[];
  },
  context: z.RefinementCtx,
): void {
  const vehicleIds =
    value.candidate_vehicle_ids ?? value.admit_vehicle_ids ?? [];
  if (
    vehicleIds.length === 0 &&
    value.lane_batches.length === 0 &&
    value.pedestrian_phases.length === 0
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide vehicle ids or at least one lane batch",
    });
  }
  const seen = new Set<string>();
  for (const [index, batch] of value.lane_batches.entries()) {
    if (seen.has(batch.lane_id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate lane batch: ${batch.lane_id}`,
        path: ["lane_batches", index, "lane_id"],
      });
    }
    seen.add(batch.lane_id);
  }
  validateVehicleSpeedProfiles(value, context);
}

function validateVehicleSpeedProfiles(
  value: {
    candidate_vehicle_ids?: readonly string[];
    admit_vehicle_ids?: readonly string[];
    vehicle_speed_profiles: readonly { vehicle_id: string }[];
  },
  context: z.RefinementCtx,
): void {
  const explicitIds = new Set(
    value.candidate_vehicle_ids ?? value.admit_vehicle_ids ?? [],
  );
  const seen = new Set<string>();
  for (const [index, request] of value.vehicle_speed_profiles.entries()) {
    if (seen.has(request.vehicle_id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate vehicle speed profile: ${request.vehicle_id}`,
        path: ["vehicle_speed_profiles", index, "vehicle_id"],
      });
    }
    seen.add(request.vehicle_id);
    if (!explicitIds.has(request.vehicle_id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `Speed profile vehicle is not an explicit vehicle id: ${request.vehicle_id}`,
        path: ["vehicle_speed_profiles", index, "vehicle_id"],
      });
    }
  }
}

const dryRunSchema = z
  .object({
    candidate_vehicle_ids: vehicleIdsSchema.default([]),
    lane_batches: z.array(laneBatchSchema).max(16).default([]),
    vehicle_speed_profiles: z
      .array(vehicleSpeedProfileSchema)
      .max(16)
      .default([]),
    pedestrian_phases: z.array(pedestrianPhaseSchema).max(4).default([]),
  })
  .superRefine(requireAdmissionSource);

const inspectLaneSchema = z.object({
  lane_id: z.string().min(1),
  depth: z.number().int().min(1).max(10).default(3),
});
const inspectCrosswalkSchema = z.object({
  crosswalk_id: z.string().min(1),
  limit: z.number().int().min(1).max(16).default(8),
});

const workingMemorySchema = z
  .object({
    action: z.enum(["SAVE_PLAN", "PEEK_PLAN", "POP_PLAN", "CLEAR"]),
    plan_data: z
      .object({
        phase_name: z.string().min(1).max(80),
        intended_duration: z.number().int().min(1).max(10_000),
        resume_condition: z.string().max(160).optional(),
      })
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.action === "SAVE_PLAN" && value.plan_data === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "plan_data is required for SAVE_PLAN",
        path: ["plan_data"],
      });
    }
  });

const inspectIncidentSchema = z.object({
  incident_id: z.string().min(1),
});

const inspectJunctionSchema = z.object({
  horizon_ticks: z.number().int().min(1).max(10).default(6),
});

const clearanceSchema = z.object({
  incident_id: z.string().min(1),
  target_evac_lane: z.string().min(1),
});

const convoySchema = z.object({
  lane_id: z.string().min(1),
  emergency_vehicle_id: z.string().min(1),
  clearing_route_id: z.string().min(1).optional(),
});

const stallRerouteSchema = z.object({
  stalled_vehicle_id: z.string().min(1),
  target_lane_id: z.string().min(1),
  vehicles_to_divert: z.number().int().min(1).max(8).default(1),
});

const towTruckSchema = z.object({
  stalled_vehicle_id: z.string().min(1),
});

const laneGuidanceSchema = z.object({
  vehicle_id: z.string().min(1),
  target_lane: z.string().min(1),
});

const detourSchema = z
  .object({
    severed_lane_id: z.string().min(1),
    action: z.enum([
      "HOLD_AT_STOPLINE",
      "RELEASE_AT_STOPLINE",
      "DIVERT_TO_ADJACENT_LANE",
    ]),
    target_adjacent_lane: z.string().min(1).optional(),
  })
  .superRefine((value, context) => {
    if (
      value.action === "DIVERT_TO_ADJACENT_LANE" &&
      value.target_adjacent_lane === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "target_adjacent_lane is required when diverting",
        path: ["target_adjacent_lane"],
      });
    }
  });

const SUMMARY_LIMIT = 300;

const commitSchema = z
  .object({
    admit_vehicle_ids: vehicleIdsSchema.default([]),
    lane_batches: z.array(laneBatchSchema).max(16).default([]),
    vehicle_speed_profiles: z
      .array(vehicleSpeedProfileSchema)
      .max(16)
      .default([]),
    pedestrian_phases: z.array(pedestrianPhaseSchema).max(4).default([]),
    sleep_ticks: z.number().int().min(1).max(10),
    tactical_summary: z.string().min(1),
  })
  .superRefine(validateVehicleSpeedProfiles);

export interface AgentToolRuntimeOptions {
  readonly engine: SimulationEngine;
  readonly memory: WorkingMemoryStack;
  readonly metrics: AgentMetricsCollector;
  readonly tollMotorcycle: number;
  readonly tollStandard: number;
  readonly tollEmergency: number;
  readonly towDispatchCost?: number;
  readonly towClearanceTicks?: number;
}

export interface CommitExecution {
  readonly admission: AdmissionBatchResult;
  readonly pedestrianPhases?: readonly PedestrianPhaseRequest[];
  readonly sleepTicks: number;
  readonly tacticalSummary: string;
}

export interface ToolExecutionResult {
  readonly output: unknown;
  readonly terminal: boolean;
  readonly commit?: CommitExecution;
}

function toLaneBatchRequests(
  batches: readonly {
    lane_id: string;
    top_n: number;
    speed_profile?: SpeedProfile | undefined;
  }[],
): LaneBatchRequest[] {
  return batches.map((batch) => ({
    laneId: batch.lane_id,
    topN: batch.top_n,
    speedProfile: batch.speed_profile ?? "CRUISE",
  }));
}

function toVehicleSpeedProfileRequests(
  profiles: readonly {
    vehicle_id: string;
    speed_profile: SpeedProfile;
  }[],
): VehicleSpeedProfileRequest[] {
  return profiles.map((profile) => ({
    vehicleId: profile.vehicle_id,
    speedProfile: profile.speed_profile,
  }));
}

function toPedestrianPhaseRequests(
  phases: readonly {
    crosswalk_id: string;
    directions: readonly ("A_TO_B" | "B_TO_A")[];
  }[],
): PedestrianPhaseRequest[] {
  return phases.map((phase) => ({
    crosswalkId: phase.crosswalk_id,
    directions: phase.directions,
  }));
}

function toToolPedestrianCohort(
  cohort: {
    readonly crosswalkId: string;
    readonly directions: readonly string[];
    readonly pedestrianIds: readonly string[];
    readonly clearTick: number;
  },
) {
  return {
    crosswalk_id: cohort.crosswalkId,
    directions: cohort.directions,
    pedestrian_ids: cohort.pedestrianIds,
    clear_tick: cohort.clearTick,
  };
}

function toToolVehiclePlans(
  engine: SimulationEngine,
  admission: AdmissionBatchResult,
  profiles: readonly VehicleSpeedProfileRequest[],
) {
  const explicitProfiles = new Map(
    profiles.map((profile) => [profile.vehicleId, profile.speedProfile]),
  );
  return admission.admittedVehicleIds
    .map((vehicleId) => {
      const vehicle = engine.vehicles.get(vehicleId);
      if (vehicle === undefined) {
        return undefined;
      }
      const entry = admission.enterPlan?.find(
        (candidate) => candidate.vehicleId === vehicleId,
      );
      const speedProfile =
        entry?.speedProfile ?? explicitProfiles.get(vehicleId) ?? "CRUISE";
      const enterTick = entry?.enterTick ?? engine.currentTick;
      const trajectory = engine.network.trajectories.get(vehicle.routeId);
      const previewVehicle: Vehicle = {
        ...vehicle,
        speedProfile,
        motionCreditHalfSlots: 0,
        slowMovesDone: 0,
        slowPhase: 0,
        encroaching:
          vehicle.admittedAtTick === engine.currentTick &&
          vehicle.trajectoryHeadSlot === 0
            ? true
            : vehicle.encroaching,
      };
      const timeline =
        trajectory === undefined
          ? []
          : vehicleOccupationTimeline(
              previewVehicle,
              trajectory.slots,
              engine.dynamics.slowStartSteps,
            );
      return [
        vehicleId,
        speedProfileLetter(speedProfile),
        enterTick,
        enterTick + (timeline.at(-1)?.tickOffset ?? 0) + 1,
        entry?.scheduled === true ? 1 : 0,
      ];
    })
    .filter((plan) => plan !== undefined);
}

function nonEmptyCrosswalkReservations(
  views: JunctionSnapshot["crosswalkReservations"],
): { crosswalks?: Record<string, [string, string]> } {
  const booked = views.filter((view) => view.cells.length > 0);
  return booked.length === 0
    ? {}
    : {
        crosswalks: Object.fromEntries(
          booked.map((view) => [
            crosswalkKey(view.crosswalkId),
            encodeCrosswalkReservations(view),
          ]),
        ),
      };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Inbound lane fields whose engine call only takes lane IDs. */
const LANE_ID_FIELDS = ["lane_id", "target_lane"] as const;

const DRY_RUN_QUOTA_PER_CYCLE = 2;

export class AgentToolRuntime {
  private dryRunCallsInCycle = 0;
  private readonly laneAliases = new Map<string, string>();
  private readonly crosswalkAliases = new Map<string, string>();

  constructor(private readonly options: AgentToolRuntimeOptions) {
    const network = options.engine.network;
    for (const trajectory of network.trajectories.values()) {
      this.laneAliases.set(trajectory.id, trajectory.inboundLaneId);
    }
    for (const laneId of network.inboundLanes.keys()) {
      this.laneAliases.set(laneId, laneId);
    }
    for (const crosswalkId of network.crosswalks.keys()) {
      const name = crosswalkId.split(":")[1] ?? crosswalkId;
      for (const alias of [crosswalkId, name, crosswalkKey(crosswalkId), `CROSSWALK:${crosswalkKey(crosswalkId)}`]) {
        this.crosswalkAliases.set(alias, crosswalkId);
      }
    }
  }

  execute(name: string, rawArguments: string): ToolExecutionResult {
    if (name !== COMMIT_SCHEDULE) {
      this.options.metrics.recordNonTerminalTool(name);
    }
    let input: unknown;
    try {
      input = this.resolveAliases(JSON.parse(rawArguments));
    } catch {
      return this.toolError(name, "INVALID_JSON", "Tool arguments are not valid JSON");
    }

    try {
      switch (name) {
        case DRY_RUN_ADMIT:
          return this.dryRun(dryRunSchema.parse(input));
        case INSPECT_LANE_QUEUE:
          return this.inspectLane(inspectLaneSchema.parse(input));
        case INSPECT_CROSSWALK:
          return this.inspectCrosswalk(inspectCrosswalkSchema.parse(input));
        case INSPECT_INCIDENT:
          return this.inspectIncident(inspectIncidentSchema.parse(input));
        case INSPECT_JUNCTION:
          return this.inspectJunction(inspectJunctionSchema.parse(input));
        case ORDER_ACCIDENT_CLEARANCE:
          return this.clearAccident(clearanceSchema.parse(input));
        case SET_LANE_DETOUR:
          return this.detourLane(detourSchema.parse(input));
        case DISPATCH_EMERGENCY_CONVOY:
          return this.dispatchConvoy(convoySchema.parse(input));
        case REROUTE_QUEUE_AROUND_STALL:
          return this.rerouteStall(stallRerouteSchema.parse(input));
        case GUIDE_INBOUND_LANE_CHANGE:
          return this.guideLaneChange(laneGuidanceSchema.parse(input));
        case DISPATCH_TOW_TRUCK:
          return this.dispatchTowTruck(towTruckSchema.parse(input));
        case MANAGE_WORKING_MEMORY:
          return this.manageMemory(workingMemorySchema.parse(input));
        case COMMIT_SCHEDULE:
          return this.commit(commitSchema.parse(this.normalizeCommitInput(input)));
        default:
          return this.toolError(name, "UNKNOWN_TOOL", `Unknown tool: ${name}`);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown tool execution error";
      return this.toolError(name, "TOOL_EXECUTION_ERROR", message);
    }
  }

  private dryRun(input: z.infer<typeof dryRunSchema>): ToolExecutionResult {
    this.dryRunCallsInCycle += 1;
    if (this.dryRunCallsInCycle > DRY_RUN_QUOTA_PER_CYCLE) {
      return {
        terminal: false,
        output: {
          ok: false,
          reason: "DRY_RUN_QUOTA_EXHAUSTED",
          message:
            "本周期 2 次试算配额已用完。只提交已经用完全相同参数验证通过的计划；若没有已验证计划，请提交空计划等待。",
        },
      };
    }

    const reward = (vehicle: Vehicle) =>
      rewardTollForVehicle(
        vehicle.type,
        this.options.tollMotorcycle,
        this.options.tollStandard,
        this.options.tollEmergency,
      );
    const phases = toPedestrianPhaseRequests(input.pedestrian_phases);
    const laneBatches = toLaneBatchRequests(input.lane_batches);
    const vehicleSpeedProfiles = toVehicleSpeedProfileRequests(
      input.vehicle_speed_profiles,
    );
    const result = this.options.engine.dryRunSchedule(
      input.candidate_vehicle_ids,
      laneBatches,
      phases,
      reward,
      vehicleSpeedProfiles,
    );
    if (result.feasible) {
      this.options.metrics.recordSuccessfulDryRun(
        input.candidate_vehicle_ids,
        laneBatches,
        vehicleSpeedProfiles,
        result.pedestrianCohorts.map((cohort) => ({
          crosswalkId: cohort.crosswalkId,
          directions: cohort.directions,
        })),
      );
    }

    return {
      terminal: false,
      output: result.feasible
        ? {
            ok: true,
            reward: result.admission.estimatedFlowReward,
            resolved_vehicle_ids: result.admission.batch.admittedVehicleIds,
            vehicle_plans: toToolVehiclePlans(
              this.options.engine,
              result.admission.batch,
              vehicleSpeedProfiles,
            ),
            pedestrian_cohorts:
              result.pedestrianCohorts.map(toToolPedestrianCohort),
            ...this.jaywalkerWarnings(result.admission.batch.admittedVehicleIds),
            ...this.tailgateWarnings(result.admission.batch.admittedVehicleIds),
          }
        : {
            ok: false,
            reason:
              result.admission.batch.results.find(
                (item) => item.reason !== undefined,
              )?.reason ??
              result.error ??
              "REJECTED",
            at:
              result.conflict === undefined
                ? 0
                : result.conflict.tick - this.options.engine.currentTick,
            conflict_tick: result.conflict?.tick,
            conflict: result.conflict?.resourceId ?? "none",
            vs: result.conflict?.actorIds ?? [],
            rejected_preview: result.admission.batch.results
              .filter((item) => item.status === "SAFETY_REJECTED")
              .map((item) => ({
                vehicle_id: item.vehicleId,
                reason: item.reason ?? "REJECTED",
              })),
            severed_reject_count: result.admission.batch.results.filter(
              (item) => item.reason === "ROUTE_SEVERED",
            ).length,
          },
    };
  }

  private inspectLane(
    input: z.infer<typeof inspectLaneSchema>,
  ): ToolExecutionResult {
    const inspection = this.options.engine.inspectLaneQueue(
      input.lane_id,
      input.depth,
    );
    return {
      terminal: false,
      output: {
        lane: inspection.laneId,
        n: inspection.totalQueued,
        occ: Number(inspection.capacityOccupancy.toFixed(2)),
        wait: inspection.maxWaitTicks,
        ids: inspection.vehiclesBehind.map((vehicle) => vehicle.id),
        vehicles: inspection.vehiclesBehind.map((vehicle) => ({
          id: vehicle.id,
          route_id: vehicle.routeId,
          state: vehicle.state,
          wait_ticks: vehicle.waitTicks,
          distance_to_stopline: vehicle.distanceToStopline,
          valid_guidance_target_lanes: vehicle.validGuidanceTargetLaneIds,
        })),
      },
    };
  }

  private inspectCrosswalk(
    input: z.infer<typeof inspectCrosswalkSchema>,
  ): ToolExecutionResult {
    const pedestrians = this.options.engine.inspectCrosswalk(
      input.crosswalk_id,
      input.limit,
    );
    return {
      terminal: false,
      output: {
        crosswalk_id: input.crosswalk_id,
        pedestrians: pedestrians.map((pedestrian) => ({
          id: pedestrian.id,
          direction: pedestrian.direction,
          state: pedestrian.state,
          waiting_ticks: pedestrian.waitingTicks,
          patience_limit: pedestrian.patienceLimit,
          patience_remaining: Math.max(
            0,
            pedestrian.patienceLimit - pedestrian.waitingTicks,
          ),
          ...(pedestrian.row === undefined ? {} : { row: pedestrian.row }),
          ...(pedestrian.column === undefined
            ? {}
            : { column: pedestrian.column }),
          ...(pedestrian.cohortId === undefined
            ? {}
            : { cohort_id: pedestrian.cohortId }),
        })),
      },
    };
  }

  private inspectIncident(
    input: z.infer<typeof inspectIncidentSchema>,
  ): ToolExecutionResult {
    const incident = this.options.engine.inspectIncident(input.incident_id);
    if (incident === undefined) {
      return {
        terminal: false,
        output: { ok: false, error: "UNKNOWN_INCIDENT" },
      };
    }
    return {
      terminal: false,
      output: {
        ok: true,
        incident_id: incident.id,
        status: incident.status,
        collision_type: incident.collisionType,
        severity: incident.severity,
        estimated_clearance_ticks: incident.estimatedClearanceTicks,
        secondary_collision_risk: incident.secondaryCollisionRisk,
        vehicles: incident.vehicleIds.map((vehicleId) => {
          const vehicle = this.options.engine.vehicles.get(vehicleId);
          return [vehicleId, vehicle?.state ?? "DESPAWNED", vehicle?.routeId ?? ""];
        }),
        ...this.lockSummary(incident.lockedResourceIds),
        severed_routes: incident.severedRouteIds,
        suggested_evac_lanes: incident.suggestedEvacLanes,
        ...(incident.activeLaneHolds.length === 0
          ? {}
          : {
              active_holds: incident.activeLaneHolds.map((hold) => [
                hold.laneId,
                hold.routeId,
                hold.sinceTick,
              ]),
            }),
        ...(incident.clearanceLatencyTicks === undefined
          ? {}
          : { clearance_latency_ticks: incident.clearanceLatencyTicks }),
      },
    };
  }

  /** Locked SPACE cells drawn on the junction grid; other resources are only counted. */
  private lockSummary(resourceIds: readonly string[]): Record<string, unknown> {
    const snapshot = this.options.engine.junctionSnapshot(1);
    const lockedCells = resourceIds
      .filter((resourceId) => resourceId.startsWith("SPACE:"))
      .map((resourceId) => {
        const [, x, y] = resourceId.split(":");
        return { x: Number(x), y: Number(y) };
      });
    const crosswalkResources = resourceIds.filter((resourceId) =>
      resourceId.startsWith("CROSSWALK:"),
    );
    const crosswalkIds = [
      ...new Set(
        crosswalkResources.flatMap((resourceId) => {
          const match = /^(CROSSWALK:[A-Z]+)(?::|$)/.exec(resourceId);
          return match?.[1] === undefined ? [] : [match[1]];
        }),
      ),
    ];
    return {
      locked_count: resourceIds.length,
      locked_space_cells: lockedCells.length,
      ...(crosswalkResources.length === 0
        ? {}
        : {
            locked_crosswalk_cells: crosswalkResources.length,
            locked_crosswalks: crosswalkIds,
          }),
      lock_grid: encodeLockGrid({ ...snapshot, lockedCells }),
    };
  }

  private inspectJunction(
    input: z.infer<typeof inspectJunctionSchema>,
  ): ToolExecutionResult {
    const snapshot = this.options.engine.junctionSnapshot(input.horizon_ticks);
    return {
      terminal: false,
      output: {
        tick: snapshot.tick,
        horizon_ticks: snapshot.horizonTicks,
        grid: encodeJunctionOccupancy(snapshot),
        reserved: encodeJunctionReservations(snapshot),
        ...nonEmptyCrosswalkReservations(snapshot.crosswalkReservations),
        vehicles: snapshot.vehicles.map((vehicle) => [
          vehicle.vehicleId,
          vehicleLetter(vehicle.type),
          vehicle.routeId,
          vehicle.state,
          speedProfileLetter(vehicle.speedProfile),
          vehicle.enterTick ?? null,
          vehicle.reservedUntilTick ?? null,
          vehicle.stale ? 1 : 0,
        ]),
      },
    };
  }

  private clearAccident(
    input: z.infer<typeof clearanceSchema>,
  ): ToolExecutionResult {
    const result = this.options.engine.orderAccidentClearance(
      input.incident_id,
      input.target_evac_lane,
    );
    return {
      terminal: false,
      output: result.ok
        ? {
            ok: true,
            incident_id: input.incident_id,
            started_vehicle_ids: result.startedVehicleIds ?? [],
            no_op: result.noOp ?? false,
            current_target_evac_lane:
              result.currentTargetEvacLane ?? input.target_evac_lane,
            target_changed: result.targetChanged ?? false,
          }
        : {
            ok: false,
            error: result.error,
            ...(result.suggestedEvacLanes === undefined
              ? {}
              : { suggested_evac_lanes: result.suggestedEvacLanes }),
          },
    };
  }

  private detourLane(input: z.infer<typeof detourSchema>): ToolExecutionResult {
    const result = this.options.engine.setLaneDetour(
      input.severed_lane_id,
      input.action,
      input.target_adjacent_lane,
    );
    if (!result.ok) {
      return {
        terminal: false,
        output: {
          ok: false,
          error: result.error,
          ...(result.detail === undefined ? {} : { detail: result.detail }),
          ...(result.validTargetRouteIds === undefined
            ? {}
            : { valid_target_route_ids: result.validTargetRouteIds }),
          ...(result.blockingVehicleId === undefined
            ? {}
            : { blocking_vehicle_id: result.blockingVehicleId }),
          ...(result.blockedSlot === undefined
            ? {}
            : { blocked_slot: result.blockedSlot }),
        },
      };
    }
    return {
      terminal: false,
      output: {
        ok: true,
        ...(result.vehicleId === undefined ? {} : { vehicle_id: result.vehicleId }),
        ...(result.routeId === undefined ? {} : { route_id: result.routeId }),
        ...(result.incidentId === undefined
          ? {}
          : { incident_id: result.incidentId }),
        ...(result.laneId === undefined ? {} : { lane_id: result.laneId }),
        ...(result.holdState === undefined
          ? {}
          : {
              state: result.holdState,
              auto_release: "ACCIDENT_CLEARED",
            }),
        ...(result.targetLaneId === undefined
          ? {}
          : { target_lane_id: result.targetLaneId }),
      },
    };
  }

  private dispatchConvoy(
    input: z.infer<typeof convoySchema>,
  ): ToolExecutionResult {
    const result =
      input.clearing_route_id === undefined
        ? this.options.engine.dispatchEmergencyConvoy(
            input.lane_id,
            input.emergency_vehicle_id,
          )
        : this.options.engine.dispatchEmergencyConvoy(
            input.lane_id,
            input.emergency_vehicle_id,
            input.clearing_route_id,
          );
    return {
      terminal: false,
      output: result.ok
        ? {
            ok: true,
            admitted: result.admittedVehicleIds ?? [],
            ...(result.targetLaneId === undefined
              ? {}
              : { target_lane_id: result.targetLaneId }),
          }
        : {
            ok: false,
            error: result.error,
            ...(result.detail === undefined ? {} : { detail: result.detail }),
            ...(result.validTargetRouteIds === undefined
              ? {}
              : { valid_target_route_ids: result.validTargetRouteIds }),
            ...(result.blockingVehicleId === undefined
              ? {}
              : { blocking_vehicle_id: result.blockingVehicleId }),
            ...(result.blockedSlot === undefined
              ? {}
              : { blocked_slot: result.blockedSlot }),
            ...(result.conflictingVehicleId === undefined
              ? {}
              : { vs: result.conflictingVehicleId }),
            ...(result.conflictingResourceId === undefined
              ? {}
              : { conflict: result.conflictingResourceId }),
          },
    };
  }

  private rerouteStall(
    input: z.infer<typeof stallRerouteSchema>,
  ): ToolExecutionResult {
    const result = this.options.engine.rerouteQueueAroundStall(
      input.stalled_vehicle_id,
      input.target_lane_id,
      input.vehicles_to_divert,
    );
    return {
      terminal: false,
      output: result.ok
        ? { ok: true, moved: result.movedVehicleIds ?? [] }
        : {
            ok: false,
            error: result.error,
            ...(result.detail === undefined ? {} : { detail: result.detail }),
          },
    };
  }

  private guideLaneChange(
    input: z.infer<typeof laneGuidanceSchema>,
  ): ToolExecutionResult {
    const result = this.options.engine.guideInboundLaneChange(
      input.vehicle_id,
      input.target_lane,
    );
    return {
      terminal: false,
      output: result.ok
        ? {
            ok: true,
            vehicle_id: result.vehicleId,
            source_lane: result.sourceLaneId,
            target_lane: result.targetLaneId,
            intent_route: result.intentRouteId,
            guided_route: result.guidedRouteId,
            distance_to_stopline: result.distanceToStopline,
          }
        : {
            ok: false,
            error: result.error,
            ...(result.detail === undefined ? {} : { detail: result.detail }),
            ...(result.distanceToStopline === undefined
              ? {}
              : { distance_to_stopline: result.distanceToStopline }),
            ...(result.validTargetLaneIds === undefined
              ? {}
              : { valid_target_lanes: result.validTargetLaneIds }),
            ...(result.blockingVehicleId === undefined
              ? {}
              : { blocking_vehicle_id: result.blockingVehicleId }),
            ...(result.blockedSlot === undefined
              ? {}
              : { blocked_slot: result.blockedSlot }),
          },
    };
  }

  private dispatchTowTruck(
    input: z.infer<typeof towTruckSchema>,
  ): ToolExecutionResult {
    const result = this.options.engine.dispatchTowTruck(
      input.stalled_vehicle_id,
      this.options.towClearanceTicks ?? 18,
      this.options.towDispatchCost ?? 1.2,
    );
    return {
      terminal: false,
      output: result.ok
        ? {
            ok: true,
            vehicle_id: result.vehicleId,
            completion_tick: result.completionTick,
            cost: result.cost,
          }
        : { ok: false, error: result.error },
    };
  }

  private manageMemory(
    input: z.infer<typeof workingMemorySchema>,
  ): ToolExecutionResult {
    const memory = this.options.memory;
    let result;

    switch (input.action) {
      case "SAVE_PLAN": {
        const plan = input.plan_data;
        if (plan === undefined) {
          throw new Error("plan_data is required for SAVE_PLAN");
        }
        result = memory.save(
          {
            phaseName: plan.phase_name,
            intendedDuration: plan.intended_duration,
            ...(plan.resume_condition === undefined
              ? {}
              : { resumeCondition: plan.resume_condition }),
          },
          this.options.engine.currentTick,
        );
        break;
      }
      case "PEEK_PLAN":
        result = memory.peek();
        break;
      case "POP_PLAN":
        result = memory.pop();
        break;
      case "CLEAR":
        result = memory.clear();
        break;
    }

    return { terminal: false, output: result };
  }

  /** Maps route IDs to their inbound lane and short crosswalk keys (N, NORTH) to full IDs. */
  private resolveAliases(input: unknown): unknown {
    if (!isRecord(input)) {
      return input;
    }
    const lane = (value: unknown) =>
      typeof value === "string" ? (this.laneAliases.get(value.toUpperCase()) ?? value) : value;
    const crosswalk = (value: unknown) =>
      typeof value === "string"
        ? (this.crosswalkAliases.get(value.toUpperCase()) ?? value)
        : value;
    const record: Record<string, unknown> = { ...input };
    for (const field of LANE_ID_FIELDS) {
      if (field in record) {
        record[field] = lane(record[field]);
      }
    }
    if ("crosswalk_id" in record) {
      record.crosswalk_id = crosswalk(record.crosswalk_id);
    }
    if (Array.isArray(record.lane_batches)) {
      record.lane_batches = record.lane_batches.map((batch: unknown) =>
        isRecord(batch) ? { ...batch, lane_id: lane(batch.lane_id) } : batch,
      );
    }
    if (Array.isArray(record.pedestrian_phases)) {
      record.pedestrian_phases = record.pedestrian_phases.map((phase: unknown) =>
        isRecord(phase) ? { ...phase, crosswalk_id: crosswalk(phase.crosswalk_id) } : phase,
      );
    }
    return record;
  }

  private normalizeCommitInput(input: unknown): unknown {
    if (typeof input !== "object" || input === null) {
      return input;
    }
    const record = input as Record<string, unknown>;
    const raw =
      typeof record.tactical_summary === "string"
        ? record.tactical_summary.trim()
        : "";
    let summary = raw.length > 0 ? raw : "committed";
    if (summary.length > SUMMARY_LIMIT) {
      this.options.metrics.recordWarning("warning_summary_truncated");
      summary = summary.slice(0, SUMMARY_LIMIT);
    }
    return { ...record, tactical_summary: summary };
  }

  private commit(input: z.infer<typeof commitSchema>): ToolExecutionResult {
    const requestedPhases = toPedestrianPhaseRequests(
      input.pedestrian_phases,
    );
    const laneBatches = toLaneBatchRequests(input.lane_batches);
    const vehicleSpeedProfiles = toVehicleSpeedProfileRequests(
      input.vehicle_speed_profiles,
    );
    const result = this.options.engine.commitSchedule(
      input.admit_vehicle_ids,
      laneBatches,
      requestedPhases,
      vehicleSpeedProfiles,
    );
    const normalizedPhases = result.pedestrianCohorts.map((cohort) => ({
      crosswalkId: cohort.crosswalkId,
      directions: cohort.directions,
    }));
    this.options.metrics.recordCommit(
      input.admit_vehicle_ids,
      laneBatches,
      vehicleSpeedProfiles,
      result.committed ? normalizedPhases : requestedPhases,
      result.admission,
    );
    return {
      terminal: true,
      commit: {
        admission: result.admission,
        pedestrianPhases:
          result.committed ? normalizedPhases : [],
        sleepTicks: input.sleep_ticks,
        tacticalSummary: input.tactical_summary,
      },
      output: {
        committed: result.committed,
        admitted_vehicle_ids: result.admission.admittedVehicleIds,
        pedestrian_cohorts:
          result.pedestrianCohorts.map(toToolPedestrianCohort),
        scheduled_vehicle_ids:
          result.admission.enterPlan
            ?.filter((entry) => entry.scheduled)
            .map((entry) => entry.vehicleId) ?? [],
        rejected_vehicle_ids: result.admission.rejectedVehicleIds,
        rejected: result.admission.results
          .filter((result) => result.status === "SAFETY_REJECTED")
          .map((result) => ({
            vehicle_id: result.vehicleId,
            reason: result.reason ?? "REJECTED",
          })),
        vehicle_plans: toToolVehiclePlans(
          this.options.engine,
          result.admission,
          vehicleSpeedProfiles,
        ),
        ...this.jaywalkerWarnings(result.admission.admittedVehicleIds),
        ...this.tailgateWarnings(result.admission.admittedVehicleIds),
        ...(result.error === undefined ? {} : { error: result.error }),
        ...(result.conflict === undefined
          ? {}
          : {
              conflict: result.conflict.resourceId,
              at:
                result.conflict.tick -
                this.options.engine.currentTick,
              conflict_tick: result.conflict.tick,
              vs: result.conflict.actorIds,
            }),
        sleep_ticks: input.sleep_ticks,
      },
    };
  }

  private tailgateWarnings(
    vehicleIds: readonly string[],
  ): { tailgate_risk?: Array<Record<string, unknown>> } {
    const risks = this.options.engine.tailgateRisk(vehicleIds);
    if (risks.length === 0) {
      return {};
    }
    return {
      tailgate_risk: risks.map((risk) => ({
        vehicle_id: risk.vehicleId,
        lane_id: risk.laneId,
        behind_vehicle_id: risk.behindVehicleId,
      })),
    };
  }

  private jaywalkerWarnings(
    vehicleIds: readonly string[],
  ): { jaywalker_warnings?: Array<Record<string, unknown>> } {
    const exposures = this.options.engine.jaywalkerExposures(vehicleIds);
    if (exposures.length === 0) {
      return {};
    }
    return {
      jaywalker_warnings: exposures.map((exposure) => ({
        vehicle_id: exposure.vehicleId,
        crosswalk_id: exposure.crosswalkId,
        pedestrian_ids: exposure.pedestrianIds,
      })),
    };
  }

  private toolError(
    toolName: string,
    code: string,
    message: string,
  ): ToolExecutionResult {
    return {
      terminal: false,
      output: { error: { tool_name: toolName, code, message } },
    };
  }
}

const LANE_ID_DESCRIPTION =
  "进口车道 ID，如 IN_N_S1_STRAIGHT。也接受路线 ID（如 N_S1_STRAIGHT，或 stoplineCandidates 里的 N_S2_GUIDED_LEFT），自动换成该路线所在的进口车道。";
const CROSSWALK_ID_DESCRIPTION =
  "斑马线 ID，如 CROSSWALK:NORTH。也接受观测 crosswalks 的短键 N/E/S/W，或 NORTH/EAST/SOUTH/WEST。";

function laneBatchesJsonSchema() {
  return {
    type: "array" as const,
    maxItems: 16,
    items: {
      type: "object" as const,
      properties: {
        lane_id: { type: "string" as const, description: LANE_ID_DESCRIPTION },
        top_n: {
          type: "integer" as const,
          minimum: 1,
          maximum: 8,
        },
        speed_profile: {
          type: "string" as const,
          enum: ["SLOW_SLIDE", "CRUISE", "BURST"],
          default: "CRUISE",
        },
      },
      required: ["lane_id", "top_n"],
      additionalProperties: false,
    },
  };
}

function vehicleSpeedProfilesJsonSchema() {
  return {
    type: "array" as const,
    maxItems: 16,
    items: {
      type: "object" as const,
      properties: {
        vehicle_id: { type: "string" as const },
        speed_profile: {
          type: "string" as const,
          enum: ["SLOW_SLIDE", "CRUISE", "BURST"],
        },
      },
      required: ["vehicle_id", "speed_profile"],
      additionalProperties: false,
    },
  };
}

function pedestrianPhasesJsonSchema() {
  return {
    type: "array" as const,
    maxItems: 4,
    items: {
      type: "object" as const,
      properties: {
        crosswalk_id: { type: "string" as const, description: CROSSWALK_ID_DESCRIPTION },
        directions: {
          type: "array" as const,
          minItems: 1,
          maxItems: 2,
          items: {
            type: "string" as const,
            enum: ["A_TO_B", "B_TO_A"],
          },
        },
      },
      required: ["crosswalk_id", "directions"],
      additionalProperties: false,
    },
  };
}

export const AGENT_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: DRY_RUN_ADMIT,
      description:
        "原子验证车辆、锁定速度档位与行人方向 phase。vehicle_speed_profiles 只能引用 candidate_vehicle_ids；lane_batches 的 speed_profile 应用于整批。省略档位默认为 CRUISE，所有参数必须与 commit_schedule 完全一致。每周期最多两次。结果若含 jaywalker_warnings，表示这些车要经过的横道上此刻有人闯红灯：ok 只说明预约表无冲突，不代表不会撞人，引擎不会刹车。结果若含 tailgate_risk，表示这些失去耐心的司机会紧跟本批最后一辆车冲进路口、不付离场收入；把它们纳入批次即可合法放行。",
      parameters: {
        type: "object",
        properties: {
          candidate_vehicle_ids: {
            type: "array",
            items: { type: "string" },
            maxItems: 16,
          },
          lane_batches: laneBatchesJsonSchema(),
          vehicle_speed_profiles: vehicleSpeedProfilesJsonSchema(),
          pedestrian_phases: pedestrianPhasesJsonSchema(),
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: INSPECT_CROSSWALK,
      description:
        "读取一条斑马线最多 16 名行人的有限详情，优先返回耐心告急、闯红灯和受伤者。不是终结动作。",
      parameters: {
        type: "object",
        properties: {
          crosswalk_id: { type: "string", description: CROSSWALK_ID_DESCRIPTION },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 16,
            default: 8,
          },
        },
        required: ["crosswalk_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: INSPECT_LANE_QUEUE,
      description:
        "查看一条可疑进口车道上队首之后的车辆。有选择地使用。",
      parameters: {
        type: "object",
        properties: {
          lane_id: { type: "string", description: LANE_ID_DESCRIPTION },
          depth: { type: "integer", minimum: 1, maximum: 10, default: 3 },
        },
        required: ["lane_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: MANAGE_WORKING_MEMORY,
      description:
        "保存、查看、恢复或清除一份高层调度计划。",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["SAVE_PLAN", "PEEK_PLAN", "POP_PLAN", "CLEAR"],
          },
          plan_data: {
            type: "object",
            properties: {
              phase_name: { type: "string", maxLength: 80 },
              intended_duration: {
                type: "integer",
                minimum: 1,
                maximum: 10_000,
              },
              resume_condition: { type: "string", maxLength: 160 },
            },
            required: ["phase_name", "intended_duration"],
            additionalProperties: false,
          },
        },
        required: ["action"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: INSPECT_INCIDENT,
      description:
        "读取一起未清场的事故：vehicles 每行 [vehicleId, state, routeId]；锁格数量（locked_count、locked_space_cells、locked_crosswalk_cells）；lock_grid 与 inspect_junction 的网格同坐标（行 0 最北、列 0 最西），# 为本事故锁住的格子，每行在最后一个 # 后截断；被切断的路线；可以缓行离开的出口车道；active_holds 每行 [laneId, routeId, sinceTick]，事故关闭时自动释放。",
      parameters: {
        type: "object",
        properties: {
          incident_id: { type: "string" },
        },
        required: ["incident_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: INSPECT_JUNCTION,
      description:
        "付费查询路口中心。grid 是此刻占用（车型字母大写车头、小写车身，# 事故锁格，* 横道上的行人，. 空闲，空格不在任何轨迹上）；reserved 的数字是该格在 horizon_ticks 内最早被预约的拍偏移（0 为本拍）；crosswalks 是 {N|E|S|W: [行 0, 行 1]}，与观测 crosswalks 的格子同布局，数字是该横道格在 horizon_ticks 内最早被车辆预约的拍偏移，. 为无车辆预约，全空的横道省略；vehicles 每行 [vehicleId, 车型字母, routeId, state, 档位 S/C/B, enterTick, reservedUntilTick, stale]，stale=1 表示车身压在已不属于它的预约格上（闯入、事故或出口受阻）。不是终结动作，按非终结工具计费。",
      parameters: {
        type: "object",
        properties: {
          horizon_ticks: { type: "integer", minimum: 1, maximum: 10 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: ORDER_ACCIDENT_CLEARANCE,
      description:
        "让事故车辆朝一条建议的出口车道缓行。它们每两拍走一格。相同目标的重复调用是幂等的，只会启动后来并入且仍停着的车辆，不会重置既有撤离进度；返回 no_op 和 started_vehicle_ids。车辆离开后，锁住的格子会解开。",
      parameters: {
        type: "object",
        properties: {
          incident_id: { type: "string" },
          target_evac_lane: { type: "string" },
        },
        required: ["incident_id", "target_evac_lane"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: SET_LANE_DETOUR,
      description:
        "有副作用的事故路线处置工具，不是查询工具。HOLD 会把事故切断路线对应进口车道暂停到事故关闭（自动释放）；RELEASE 可提前解除；DIVERT 把未抛锚队首实体滑到有空间的直接相邻进口车道，借道后保持原去向（必要时改走引导轨迹），并作废目标车道上已放行未入场车辆的许可。查询切断路线请用 observation 或 inspect_incident。没有保持去向的轨迹时返回 MANEUVER_NOT_SUPPORTED；普通路线返回 SOURCE_NOT_SEVERED，抛锚队首返回 STALLED_HEAD，失败时按 valid_target_route_ids 和 blocker 修正。",
      parameters: {
        type: "object",
        properties: {
          severed_lane_id: { type: "string" },
          action: {
            type: "string",
            enum: [
              "HOLD_AT_STOPLINE",
              "RELEASE_AT_STOPLINE",
              "DIVERT_TO_ADJACENT_LANE",
            ],
          },
          target_adjacent_lane: { type: "string" },
        },
        required: ["severed_lane_id", "action"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: DISPATCH_EMERGENCY_CONVOY,
      description:
        "把一辆进口紧急车前方的车作为一组零间隔车队放出。clearing_route_id 存在时，前车必须先实体滑到有空间的直接相邻车道，不能只改 route 或跨道；借道车保持原去向，目标车道上其他已放行未入场车辆的许可会被作废；任一步失败则整组零变更，并返回合法目标或 blocker。不是终结动作，之后仍要调用 commit_schedule。",
      parameters: {
        type: "object",
        properties: {
          lane_id: { type: "string", description: LANE_ID_DESCRIPTION },
          emergency_vehicle_id: { type: "string" },
          clearing_route_id: { type: "string" },
        },
        required: ["lane_id", "emergency_vehicle_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: REROUTE_QUEUE_AROUND_STALL,
      description:
        "把抛锚车后方排队的车辆滑到相邻同起点车道的相同槽位；借道车保持原去向，必要时改走引导轨迹，目标车道上已放行未入场车辆的许可会被作废。先看 stalledVehicles.bypassAvailability，只选择 maxMovableVehicles 足够的目标和数量；unsupportedVehicleId 表示该车在目标车道没有保持去向的轨迹。不是终结动作。目标槽位被占时谁都不动，后方的链式加价在随后的 sleep_ticks 里继续上涨。",
      parameters: {
        type: "object",
        properties: {
          stalled_vehicle_id: { type: "string" },
          target_lane_id: { type: "string" },
          vehicles_to_divert: { type: "integer", minimum: 1, maximum: 8, default: 1 },
        },
        required: ["stalled_vehicle_id", "target_lane_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: GUIDE_INBOUND_LANE_CHANGE,
      description:
        "有副作用的主动诱导工具。在车辆距停止线 12–24 格时，把车辆原子地滑入同方向相邻物理车道（L1 左转借 S2、S2 直行借 L1、S1 直行借 R1、R1 右转借 S1），并自动保留原意图与授予借道轨迹许可；目标车道上已放行未入场车辆的许可会被作废。先用 laneGuidanceOpportunities 或 inspect_lane_queue 提供的 valid_guidance_target_lanes 选择车辆和目标。目标同槽位被占、太早或太晚时整笔不变。不是终结动作。",
      parameters: {
        type: "object",
        properties: {
          vehicle_id: { type: "string" },
          target_lane: { type: "string", description: LANE_ID_DESCRIPTION },
        },
        required: ["vehicle_id", "target_lane"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: DISPATCH_TOW_TRUCK,
      description:
        "为真实 STALLED 车辆派出付费拖车。任务创建后不可重复，车辆在 completion_tick 被移除并释放车道；到达前链式延误仍继续。适用于 bypassAvailability 全部为 0 或长期无法绕行的抛锚。不是终结动作。",
      parameters: {
        type: "object",
        properties: {
          stalled_vehicle_id: { type: "string" },
        },
        required: ["stalled_vehicle_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: COMMIT_SCHEDULE,
      description:
        "终结动作：原子提交零散队首、多车道 Top-N、锁定速度档位和行人方向 phase。vehicle_speed_profiles 只能引用 admit_vehicle_ids；lane_batches 的 speed_profile 应用于整批；省略档位默认为 CRUISE。必须与 dry-run 完全一致。",
      parameters: {
        type: "object",
        properties: {
          admit_vehicle_ids: {
            type: "array",
            items: { type: "string" },
            maxItems: 16,
          },
          lane_batches: laneBatchesJsonSchema(),
          vehicle_speed_profiles: vehicleSpeedProfilesJsonSchema(),
          pedestrian_phases: pedestrianPhasesJsonSchema(),
          sleep_ticks: {
            type: "integer",
            minimum: 1,
            maximum: 10,
            description:
              "推进物理的拍数，从 1 到 10，由你决定。一条直行大约预约 13 拍。blockedRoutes 中 RESERVATION 可等预约到期；INCIDENT 在事故关闭前不可放行，blockedUntilTick 只是清障估计。每一拍都会让仍堵在抛锚车后方的车辆继续累计链式加价：超出 20 拍后，第 k 拍每辆扣 k × 链式步长（见系统提示），k 每拍加 1。放行其他车道不会停下这项。",
          },
          tactical_summary: { type: "string", maxLength: 300 },
        },
        required: [
          "sleep_ticks",
          "tactical_summary",
        ],
        additionalProperties: false,
      },
    },
  },
];
