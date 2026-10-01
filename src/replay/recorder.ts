import type { AgentCycleResult, AgentTraceEvent } from "../agent/runner.js";
import type {
  PlannedAdmissionEntry,
  Pedestrian,
  RoadNetwork,
  Vehicle,
  VehicleDespawnEvent,
} from "../core/types.js";
import { vehicleOccupationTimeline } from "../core/safety.js";
import type { ReplayIdentity } from "./types.js";
import {
  createReplayScene,
  resolvePedestrianPoses,
  resolveVehiclePose,
} from "./geometry.js";
import type { VehicleScore } from "./vehicle-ledger.js";
import {
  REPLAY_SCHEMA_VERSION,
  SIMULATION_RULES_VERSION,
  type ReplayBundle,
  type ReplayConflictMarker,
  type ReplayDecisionCycle,
  type ReplayDryRunCandidate,
  type ReplayEvent,
  type ReplayEventKind,
  type ReplayFrame,
  type ReplayPedestrianPose,
  type ReplayReservationPreview,
  type ReplayScene,
  type ReplayVehiclePose,
} from "./types.js";

const DRY_RUN_ADMIT = "dry_run_admit";

export interface ReplayPart {
  readonly frames: readonly ReplayFrame[];
  readonly events: readonly ReplayEvent[];
  readonly cycles: readonly ReplayDecisionCycle[];
}

export interface ReplayFrameSnapshot {
  readonly financialBalance?: number;
  readonly scores?: ReadonlyMap<string, VehicleScore>;
  readonly pedestrianScores?: ReadonlyMap<string, VehicleScore>;
}

export interface ReplayRecorderOptions {
  readonly network: RoadNetwork;
  readonly identity: ReplayIdentity;
  readonly model: string;
  readonly seed: number;
  readonly tickDurationMs: number;
  readonly warmupTicks: number;
  readonly slowStartSteps?: number;
}

export class ReplayRecorder {
  private readonly scene: ReplayScene;
  private readonly frames: ReplayFrame[] = [];
  private readonly events: ReplayEvent[] = [];
  private readonly cycles: ReplayDecisionCycle[] = [];
  private sequence = 0;
  private savedFrameCount = 0;
  private savedEventCount = 0;
  private savedCycleCount = 0;

  constructor(private readonly options: ReplayRecorderOptions) {
    this.scene = createReplayScene(options.network);
  }

  recordFrame(
    tick: number,
    vehicles: Iterable<Vehicle>,
    pedestrians: Iterable<Pedestrian>,
    phase: ReplayFrame["phase"],
    snapshot?: ReplayFrameSnapshot,
  ): void {
    this.frames.push({
      tick,
      phase,
      ...(snapshot?.financialBalance === undefined
        ? {}
        : { financialBalance: snapshot.financialBalance }),
      vehicles: [...vehicles]
        .filter((vehicle) => vehicle.state !== "DESPAWNED")
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((vehicle) =>
          stampVehicleScore(
            resolveVehiclePose(vehicle, this.scene),
            snapshot?.scores?.get(vehicle.id),
          ),
        ),
      pedestrians: resolvePedestrianPoses(pedestrians, this.scene).map((pose) =>
        stampPedestrianScore(
          pose,
          snapshot?.pedestrianScores?.get(pose.id),
        ),
      ),
    });
  }

  recordSpawns(tick: number, vehicles: readonly Vehicle[]): void {
    for (const vehicle of vehicles) {
      this.pushEvent("SPAWN", tick, {
        vehicleId: vehicle.id,
        type: vehicle.type,
        routeId: vehicle.routeId,
      });
    }
  }

  recordDespawns(events: readonly VehicleDespawnEvent[]): void {
    for (const event of events) {
      this.pushEvent("DESPAWN", event.tick, {
        vehicleId: event.vehicleId,
        type: event.vehicleType,
        totalTravelTicks: event.totalTravelTicks,
      });
    }
  }

  recordCycle(
    result: AgentCycleResult,
    vehicles: ReadonlyMap<string, Vehicle>,
    financialBalance: number,
  ): void {
    const tick = result.observation.currentTick;
    const cycle = this.cycles.length + 1;
    this.pushEvent(
      "DECISION_START",
      tick,
      {
        observation: result.observation,
        interruptReason: result.observation.interruptReason,
      },
      cycle,
    );

    const pendingCalls = new Map<
      string,
      { name: string; arguments: unknown }
    >();
    for (const event of result.trace) {
      this.recordTraceEvent(event, tick, vehicles, pendingCalls);
    }
    const admission = result.commit.admission;
    const entriesByVehicle = new Map(
      (admission.enterPlan ?? []).map((entry) => [entry.vehicleId, entry]),
    );
    const commitPlan = admission.admittedVehicleIds.map(
      (vehicleId): PlannedAdmissionEntry =>
        entriesByVehicle.get(vehicleId) ?? {
          vehicleId,
          laneId: vehicles.get(vehicleId)?.inboundLaneId ?? "unknown",
          enterTick: tick,
          scheduled: false,
          speedProfile: vehicles.get(vehicleId)?.speedProfile ?? "CRUISE",
        },
    );
    const commitArguments = [...pendingCalls.values()]
      .filter((call) => call.name === "commit_schedule")
      .at(-1)?.arguments;
    const commitArgumentRecord = asRecord(commitArguments);
    this.pushEvent(
      "COMMIT",
      tick,
      {
        tacticalSummary: result.commit.tacticalSummary,
        sleepTicks: result.commit.sleepTicks,
        usedFallback: result.usedFallback,
        admittedVehicleIds: admission.admittedVehicleIds,
        rejectedVehicleIds: admission.rejectedVehicleIds,
        pedestrianPhases: result.commit.pedestrianPhases ?? [],
        enterPlan: admission.enterPlan,
        vehiclePlans: commitPlan.map((entry) => ({
          vehicleId: entry.vehicleId,
          enterTick: entry.enterTick,
          scheduled: entry.scheduled,
          speedProfile: entry.speedProfile,
        })),
        vehicle_speed_profiles: arrayOrEmpty(
          commitArgumentRecord.vehicle_speed_profiles,
        ),
        lane_batches: arrayOrEmpty(commitArgumentRecord.lane_batches),
        reservationPreview: this.reservationPreview(commitPlan, vehicles),
      },
      cycle,
    );
    const immediateIds =
      admission.enterPlan === undefined
        ? admission.admittedVehicleIds
        : admission.enterPlan
            .filter((entry) => !entry.scheduled)
            .map((entry) => entry.vehicleId);
    for (const vehicleId of immediateIds) {
      this.pushEvent(
        "ADMIT",
        tick,
        {
          vehicleId,
          routeId: vehicles.get(vehicleId)?.routeId,
        },
        cycle,
      );
    }
    for (const rejected of admission.results.filter(
      (item) => item.status === "SAFETY_REJECTED",
    )) {
      this.pushEvent(
        "REJECT",
        tick,
        {
          vehicleId: rejected.vehicleId,
          reason: rejected.reason,
          conflictingVehicleId: rejected.conflictingVehicleId,
          conflictingResourceId: rejected.conflictingResourceId,
          conflict: this.conflictMarker(
            rejected.conflictingResourceId,
            rejected.conflictingVehicleId === undefined
              ? []
              : [rejected.conflictingVehicleId],
          ),
        },
        cycle,
      );
    }

    this.cycles.push({
      cycle,
      decisionTick: tick,
      commitTick: tick,
      sleepTicks: result.commit.sleepTicks,
      physicsEndTick: tick + result.commit.sleepTicks,
      usedFallback: result.usedFallback,
      tacticalSummary: result.commit.tacticalSummary,
      admittedVehicleIds: admission.admittedVehicleIds,
      rejectedVehicleIds: admission.rejectedVehicleIds,
      financialBalance,
      promptTokens: result.metrics.promptTokens,
      completionTokens: result.metrics.completionTokens,
      observation: result.observation,
    });
  }

  recordWorldEvent(
    kind: ReplayEventKind,
    tick: number,
    payload: unknown,
  ): void {
    this.pushEvent(kind, tick, payload);
  }

  drainReplayPart(): ReplayPart {
    const part: ReplayPart = {
      frames: this.frames.slice(this.savedFrameCount),
      events: this.events.slice(this.savedEventCount),
      cycles: this.cycles.slice(this.savedCycleCount),
    };
    this.savedFrameCount = this.frames.length;
    this.savedEventCount = this.events.length;
    this.savedCycleCount = this.cycles.length;
    return part;
  }

  loadReplayParts(parts: readonly ReplayPart[]): void {
    this.frames.length = 0;
    this.events.length = 0;
    this.cycles.length = 0;
    for (const part of parts) {
      this.frames.push(...part.frames);
      this.events.push(...part.events);
      this.cycles.push(...part.cycles);
    }
    this.savedFrameCount = this.frames.length;
    this.savedEventCount = this.events.length;
    this.savedCycleCount = this.cycles.length;
    this.sequence = this.events.length;
  }

  finalize(): ReplayBundle {
    const lastFrame = this.frames[this.frames.length - 1];
    return {
      schemaVersion: REPLAY_SCHEMA_VERSION,
      simulationRulesVersion: SIMULATION_RULES_VERSION,
      tickDurationMs: this.options.tickDurationMs,
      warmupTicks: this.options.warmupTicks,
      totalTicks: lastFrame?.tick ?? 0,
      identity: this.options.identity,
      model: this.options.model,
      seed: this.options.seed,
      scene: this.scene,
      frames: this.frames,
      events: this.events,
      cycles: this.cycles,
    };
  }

  private recordTraceEvent(
    event: AgentTraceEvent,
    tick: number,
    vehicles: ReadonlyMap<string, Vehicle>,
    pendingCalls: Map<string, { name: string; arguments: unknown }>,
  ): void {
    if (event.kind === "MODEL_RESPONSE") {
      const data = asRecord(event.data);
      this.pushEvent("MODEL_RESPONSE", tick, {
        content: data.content ?? null,
        finishReason: data.finishReason ?? null,
      });
      const toolCalls = Array.isArray(data.toolCalls) ? data.toolCalls : [];
      for (const call of toolCalls) {
        const record = asRecord(call);
        const fn = asRecord(record.function);
        const id = typeof record.id === "string" ? record.id : undefined;
        const name = typeof fn.name === "string" ? fn.name : "unknown";
        const args = parseJson(fn.arguments);
        if (id !== undefined) {
          pendingCalls.set(id, { name, arguments: args });
        }
        this.pushEvent("TOOL_CALL", tick, {
          toolCallId: id,
          toolName: name,
          arguments: args,
        });
      }
      return;
    }

    if (event.kind === "TOOL_RESULT") {
      const data = asRecord(event.data);
      const toolName =
        typeof data.toolName === "string" ? data.toolName : "unknown";
      const toolCallId =
        typeof data.toolCallId === "string" ? data.toolCallId : undefined;
      this.pushEvent("TOOL_RESULT", tick, {
        toolCallId,
        toolName,
        output: data.output,
      });
      if (toolName === DRY_RUN_ADMIT) {
        this.recordDryRun(
          tick,
          data.output,
          pendingCalls.get(toolCallId ?? ""),
          vehicles,
        );
      }
      return;
    }

    if (event.kind === "FALLBACK") {
      this.pushEvent("FALLBACK", tick, event.data);
      return;
    }

    if (event.kind === "PROTOCOL_WARNING") {
      this.pushEvent("PROTOCOL_WARNING", tick, { warning: event.data });
    }
  }

  private recordDryRun(
    tick: number,
    output: unknown,
    call: { name: string; arguments: unknown } | undefined,
    vehicles: ReadonlyMap<string, Vehicle>,
  ): void {
    const args = asRecord(call?.arguments);
    const vehicleIds = Array.isArray(args.candidate_vehicle_ids)
      ? args.candidate_vehicle_ids.filter(
          (item): item is string => typeof item === "string",
        )
      : [];
    const result = asRecord(output);
    const vehiclePlans = Array.isArray(result.vehicle_plans)
      ? result.vehicle_plans.map(vehiclePlanRecord)
      : [];
    const resolvedVehicleIds = [
      ...new Set([
        ...vehicleIds,
        ...vehiclePlans.flatMap((entry) =>
          typeof entry.vehicle_id === "string" ? [entry.vehicle_id] : [],
        ),
      ]),
    ];
    const explicitProfiles = new Map(
      arrayOrEmpty(args.vehicle_speed_profiles)
        .map(asRecord)
        .flatMap((profile) => {
          const vehicleId = stringOrUndefined(profile.vehicle_id);
          const speedProfile = speedProfileOrUndefined(profile.speed_profile);
          return vehicleId === undefined || speedProfile === undefined
            ? []
            : [[vehicleId, speedProfile] as const];
        }),
    );
    const candidates: ReplayDryRunCandidate[] = resolvedVehicleIds.map(
      (vehicleId) => {
        const vehiclePlan = vehiclePlans.find(
          (item) => item.vehicle_id === vehicleId,
        );
        const enterTick = numberOrUndefined(vehiclePlan?.enter_tick);
        const speedProfile =
          speedProfileOrUndefined(vehiclePlan?.speed_profile) ??
          explicitProfiles.get(vehicleId) ??
          "CRUISE";
        return {
          vehicleId,
          routeId: vehicles.get(vehicleId)?.routeId ?? "unknown",
          speedProfile,
          ...(enterTick === undefined
            ? {}
            : { enterTickOffset: enterTick - tick }),
        };
      },
    );
    const feasible = result.ok === true;
    const previewPlan: PlannedAdmissionEntry[] = candidates.map((candidate) => ({
      vehicleId: candidate.vehicleId,
      laneId: vehicles.get(candidate.vehicleId)?.inboundLaneId ?? "unknown",
      enterTick: tick + (candidate.enterTickOffset ?? 0),
      scheduled: (candidate.enterTickOffset ?? 0) > 0,
      speedProfile: candidate.speedProfile ?? "CRUISE",
    }));
    const conflictId =
      typeof result.conflict === "string" ? result.conflict : undefined;
    const vs = Array.isArray(result.vs)
      ? result.vs.filter((item): item is string => typeof item === "string")
      : [];
    this.pushEvent("DRY_RUN_ADMIT", tick, {
      vehicleIds: resolvedVehicleIds,
      candidates,
      feasible,
      vehicle_speed_profiles: arrayOrEmpty(args.vehicle_speed_profiles),
      lane_batches: arrayOrEmpty(args.lane_batches),
      reservationPreview: this.reservationPreview(previewPlan, vehicles),
      ...(typeof result.reward === "number" ? { reward: result.reward } : {}),
      ...(feasible
        ? {}
        : {
            conflict: this.conflictMarker(conflictId, vs, numberOrUndefined(result.at)),
          }),
    });
  }

  private reservationPreview(
    entries: readonly PlannedAdmissionEntry[],
    vehicles: ReadonlyMap<string, Vehicle>,
  ): ReplayReservationPreview[] {
    return entries.flatMap((entry) => {
      const vehicle = vehicles.get(entry.vehicleId);
      const trajectory =
        vehicle === undefined
          ? undefined
          : this.options.network.trajectories.get(vehicle.routeId);
      if (vehicle === undefined || trajectory === undefined) {
        return [];
      }
      return [
        {
          vehicleId: vehicle.id,
          routeId: vehicle.routeId,
          enterTick: entry.enterTick,
          speedProfile: entry.speedProfile,
          steps: vehicleOccupationTimeline(
            {
              ...vehicle,
              speedProfile: entry.speedProfile,
              motionCreditHalfSlots: 0,
              slowMovesDone: 0,
              slowPhase: 0,
            },
            trajectory.slots,
            this.options.slowStartSteps,
          ).map(
            (occupation) => ({
              tickOffset: occupation.tickOffset,
              resourceIds: [...occupation.resourceIds].sort(),
            }),
          ),
        },
      ];
    });
  }

  private conflictMarker(
    conflictResourceId: string | undefined,
    conflictingVehicleIds: readonly string[],
    tickOffset?: number,
  ): ReplayConflictMarker | undefined {
    if (conflictResourceId === undefined) {
      return undefined;
    }
    const position = this.scene.conflictResources[conflictResourceId] ?? {
      x: 0,
      z: 0,
    };
    return {
      conflictResourceId,
      x: position.x,
      z: position.z,
      conflictingVehicleIds,
      ...(tickOffset === undefined ? {} : { tickOffset }),
    };
  }

  private pushEvent(
    kind: ReplayEventKind,
    tick: number,
    payload: unknown,
    cycle?: number,
  ): void {
    const event: ReplayEvent = {
      id: `${kind.toLowerCase()}-${this.sequence}`,
      kind,
      tick,
      sequence: this.sequence,
      payload,
      ...(cycle === undefined ? {} : { cycle }),
    };
    this.sequence += 1;
    this.events.push(event);
  }
}

function stampVehicleScore(
  pose: ReplayVehiclePose,
  score: VehicleScore | undefined,
): ReplayVehiclePose {
  if (score === undefined) {
    return pose;
  }
  return {
    ...pose,
    score: score.score,
    scorePhase: score.scorePhase,
  };
}

function stampPedestrianScore(
  pose: ReplayPedestrianPose,
  score: VehicleScore | undefined,
): ReplayPedestrianPose {
  if (score === undefined) {
    return pose;
  }
  return {
    ...pose,
    score: score.score,
    scorePhase: score.scorePhase,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function speedProfileOrUndefined(
  value: unknown,
): Vehicle["speedProfile"] | undefined {
  return value === "SLOW_SLIDE" || value === "CRUISE" || value === "BURST"
    ? value
    : undefined;
}

const SPEED_PROFILE_LETTERS: Record<string, Vehicle["speedProfile"]> = {
  S: "SLOW_SLIDE",
  C: "CRUISE",
  B: "BURST",
};

/** Tool results encode a plan as `[vehicleId, profileLetter, enterTick, clearTick, scheduled]`. */
function vehiclePlanRecord(value: unknown): Record<string, unknown> {
  if (!Array.isArray(value)) {
    return asRecord(value);
  }
  const [vehicleId, profile, enterTick] = value;
  return {
    vehicle_id: vehicleId,
    speed_profile:
      typeof profile === "string" ? (SPEED_PROFILE_LETTERS[profile] ?? profile) : undefined,
    enter_tick: enterTick,
  };
}

function arrayOrEmpty(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
