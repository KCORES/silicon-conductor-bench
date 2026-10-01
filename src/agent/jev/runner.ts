import { config } from "../../config.js";
import type { CompactObservation } from "../../core/types.js";
import type { SimulationEngine } from "../../core/engine.js";
import { createArtifactIdentity } from "../../io/artifacts.js";
import {
  createDefaultAgentApiLogger,
  type AgentApiLogger,
} from "../api-logger.js";
import {
  AgentMetricsCollector,
  type AgentEconomyConfig,
} from "../metrics.js";
import type { AgentCycleInput, AgentCycleResult, AgentTraceEvent, RunnerCheckpointState } from "../runner.js";
import {
  COMMIT_SCHEDULE,
  DRY_RUN_ADMIT,
  INSPECT_INCIDENT,
  AgentToolRuntime,
  type CommitExecution,
} from "../tools.js";
import type { WorkingMemoryStack } from "../working-memory.js";
import type { BaselineDecider } from "./baselines.js";
import {
  JevApiError,
  jevUsageToTokenUsage,
  type JevAnswer,
  type JevEvaluator,
} from "./client.js";
import {
  compileJevSchedule,
  formatJevSummary,
  laneBatchesFor,
  selectVerifiedPhase,
  type JevToolCall,
  type PhaseProbeResult,
} from "./compile.js";
import {
  buildJevQuestions,
  buildJevState,
  type JevIncidentFact,
  type PhaseCandidate,
} from "./questions.js";

interface RecentCycle {
  readonly cycle: number;
  readonly tick: number;
  readonly admittedVehicleIds: readonly string[];
  readonly tacticalSummary: string;
}

interface CachedIncident {
  fact: JevIncidentFact;
  clearanceOrdered: boolean;
}

export interface JevAgentRunnerOptions {
  readonly client?: JevEvaluator;
  readonly baseline?: BaselineDecider;
  readonly deciderName?: string;
  readonly engine: SimulationEngine;
  readonly memory: WorkingMemoryStack;
  readonly model: string;
  readonly economy: AgentEconomyConfig;
  readonly tollMotorcycle: number;
  readonly tollStandard: number;
  readonly tollEmergency: number;
  readonly towDispatchCost?: number;
  readonly towClearanceTicks?: number;
  readonly logger?: AgentApiLogger;
}

export class JevAgentRunner {
  private readonly recentCycles: RecentCycle[] = [];
  private readonly incidents = new Map<string, CachedIncident>();
  private readonly logger: AgentApiLogger;
  private readonly deciderName: string;
  private cycle = 0;

  constructor(private readonly options: JevAgentRunnerOptions) {
    if ((options.client === undefined) === (options.baseline === undefined)) {
      throw new Error("JevAgentRunner needs exactly one of client or baseline");
    }
    this.deciderName = options.deciderName ?? (options.client === undefined ? "baseline" : "jev");
    this.logger =
      options.logger ??
      createDefaultAgentApiLogger({
        enabled: config.agent.apiLog,
        consoleEnabled: config.agent.apiLogConsole,
        directory: config.agent.apiLogDir,
        identity: createArtifactIdentity({
          model: options.model,
          ...(config.agent.artifactPostfix.length > 0
            ? { postfix: config.agent.artifactPostfix }
            : {}),
        }),
      });
  }

  async runCycle(input: AgentCycleInput): Promise<AgentCycleResult> {
    this.cycle += 1;
    const tick = this.options.engine.currentTick;
    const peeked = this.options.memory.peek().plan;
    const observation = this.options.engine.buildObservation(
      input.financialBalance,
      input.interruptReason,
      peeked === null
        ? null
        : {
            phaseName: peeked.phaseName,
            targetTick: peeked.targetTick,
            isExpired: tick >= peeked.targetTick,
            depth: this.options.memory.depth,
          },
    );
    const metrics = new AgentMetricsCollector(this.options.economy);
    const runtime = new AgentToolRuntime({
      engine: this.options.engine,
      memory: this.options.memory,
      metrics,
      tollMotorcycle: this.options.tollMotorcycle,
      tollStandard: this.options.tollStandard,
      tollEmergency: this.options.tollEmergency,
      ...(this.options.towDispatchCost === undefined
        ? {}
        : { towDispatchCost: this.options.towDispatchCost }),
      ...(this.options.towClearanceTicks === undefined
        ? {}
        : { towClearanceTicks: this.options.towClearanceTicks }),
    });
    const trace: AgentTraceEvent[] = [];
    const round = 1;
    const build = buildJevQuestions({
      observation,
      network: this.options.engine.network,
      incidents: this.openIncidentFacts(runtime, trace, tick, round),
    });

    const answers = await this.decide(build, observation, metrics, trace, tick, round);
    if (answers === undefined) {
      return this.fallback(observation, metrics, trace);
    }

    const schedule = compileJevSchedule(build.facts, answers);
    const actions: string[] = [];
    for (const call of schedule.sideEffects) {
      const result = this.executeTool(runtime, trace, tick, round, call);
      if (isToolOk(result.output)) {
        actions.push(sideEffectLabel(call));
        this.noteSideEffect(call);
      } else {
        this.noteSideEffectFailure(call, result.output);
      }
    }
    const selection = selectVerifiedPhase(schedule.rankedPhases, (phase) =>
      this.dryRun(runtime, trace, tick, round, phase, schedule.topN),
    );
    const commitCall: JevToolCall = {
      name: COMMIT_SCHEDULE,
      arguments: {
        admit_vehicle_ids: [],
        lane_batches: laneBatchesFor(selection.phase, schedule.topN),
        vehicle_speed_profiles: [],
        pedestrian_phases: selection.phase?.pedestrianPhases ?? [],
        sleep_ticks: schedule.sleepTicks,
        tactical_summary: formatJevSummary({
          decider: this.deciderName,
          selection,
          topN: schedule.topN,
          sleepTicks: schedule.sleepTicks,
          actions,
        }),
      },
    };
    const committed = this.executeTool(runtime, trace, tick, round, commitCall);
    if (committed.commit === undefined) {
      trace.push({ kind: "FALLBACK", round, data: { reason: "commit_failed" } });
      return this.fallback(observation, metrics, trace);
    }
    this.remember(observation, committed.commit);
    return {
      commit: committed.commit,
      metrics: metrics.snapshot(),
      trace,
      observation,
      usedFallback: false,
    };
  }

  private async decide(
    build: ReturnType<typeof buildJevQuestions>,
    observation: CompactObservation,
    metrics: AgentMetricsCollector,
    trace: AgentTraceEvent[],
    tick: number,
    round: number,
  ): Promise<Readonly<Record<string, JevAnswer>> | undefined> {
    if (this.options.baseline !== undefined) {
      const answers = await this.options.baseline(build);
      const payload = { model: this.options.model, baseline: true, answers };
      this.logApi("API_RESPONSE", tick, round, payload, 0);
      trace.push({ kind: "MODEL_RESPONSE", round, data: answers });
      return answers;
    }
    const client = this.options.client;
    if (client === undefined) {
      return undefined;
    }
    const requestPayload = {
      model: this.options.model,
      state: buildJevState({
        observation,
        facts: build.facts,
        recentCycles: this.recentCycles,
      }),
      questions: build.questions,
    };
    this.logApi("API_REQUEST", tick, round, requestPayload);
    trace.push({ kind: "API_REQUEST", round, data: requestPayload });
    const startedAt = performance.now();
    try {
      const evaluation = await client.evaluate(requestPayload);
      const latencyMs = Math.round(performance.now() - startedAt);
      const tokenStats = metrics.recordApiCall(
        latencyMs,
        jevUsageToTokenUsage(evaluation.usage),
      );
      this.logApi(
        "API_RESPONSE",
        tick,
        round,
        {
          model: evaluation.model,
          answers: evaluation.answers,
          usage: evaluation.usage ?? null,
          tokenStats,
        },
        latencyMs,
      );
      trace.push({ kind: "MODEL_RESPONSE", round, data: evaluation.answers });
      return evaluation.answers;
    } catch (error) {
      const latencyMs = Math.round(performance.now() - startedAt);
      const status = error instanceof JevApiError ? error.status : undefined;
      const errorPayload = {
        message: error instanceof Error ? error.message : String(error),
        ...(status === undefined ? {} : { status }),
      };
      metrics.recordApiCall(latencyMs);
      metrics.recordProtocolViolation("api_error");
      this.logApi("API_ERROR", tick, round, errorPayload, latencyMs);
      trace.push({ kind: "API_ERROR", round, data: errorPayload });
      trace.push({
        kind: "FALLBACK",
        round,
        data: { reason: "api_error", message: errorPayload.message },
      });
      return undefined;
    }
  }

  private openIncidentFacts(
    runtime: AgentToolRuntime,
    trace: AgentTraceEvent[],
    tick: number,
    round: number,
  ): JevIncidentFact[] {
    const open = new Set<string>();
    for (const incident of this.options.engine.incidentSummaries()) {
      if (incident.status !== "OPEN") {
        continue;
      }
      open.add(incident.id);
      if (this.incidents.has(incident.id)) {
        continue;
      }
      const result = this.executeTool(runtime, trace, tick, round, {
        name: INSPECT_INCIDENT,
        arguments: { incident_id: incident.id },
      });
      if (!isToolOk(result.output) || !isRecord(result.output)) {
        continue;
      }
      const severedLaneIds = stringList(result.output.severed_routes).flatMap((routeId) => {
        const laneId = this.options.engine.network.trajectories.get(routeId)?.inboundLaneId;
        return laneId === undefined ? [] : [laneId];
      });
      const lockedCrosswalkIds = stringList(result.output.locked_crosswalks);
      this.incidents.set(incident.id, {
        fact: {
          incidentId: incident.id,
          suggestedEvacLanes: stringList(result.output.suggested_evac_lanes),
          severedLaneIds,
          lockedCrosswalkIds,
        },
        clearanceOrdered: false,
      });
    }
    for (const incidentId of [...this.incidents.keys()]) {
      if (!open.has(incidentId)) {
        this.incidents.delete(incidentId);
      }
    }
    return [...this.incidents.values()].map((cached) =>
      cached.clearanceOrdered
        ? { ...cached.fact, suggestedEvacLanes: [] }
        : cached.fact,
    );
  }

  private noteSideEffect(call: JevToolCall): void {
    const incidentId = call.arguments.incident_id;
    if (call.name === "order_accident_clearance" && typeof incidentId === "string") {
      const cached = this.incidents.get(incidentId);
      if (cached !== undefined) {
        cached.clearanceOrdered = true;
      }
    }
  }

  private noteSideEffectFailure(call: JevToolCall, output: unknown): void {
    const incidentId = call.arguments.incident_id;
    if (
      call.name !== "order_accident_clearance" ||
      typeof incidentId !== "string" ||
      !isRecord(output) ||
      !Array.isArray(output.suggested_evac_lanes)
    ) {
      return;
    }
    const cached = this.incidents.get(incidentId);
    if (cached !== undefined) {
      cached.fact = {
        ...cached.fact,
        suggestedEvacLanes: stringList(output.suggested_evac_lanes),
      };
    }
  }

  private dryRun(
    runtime: AgentToolRuntime,
    trace: AgentTraceEvent[],
    tick: number,
    round: number,
    phase: PhaseCandidate,
    topN: number,
  ): PhaseProbeResult {
    const result = this.executeTool(runtime, trace, tick, round, {
      name: DRY_RUN_ADMIT,
      arguments: {
        candidate_vehicle_ids: [],
        lane_batches: laneBatchesFor(phase, topN),
        vehicle_speed_profiles: [],
        pedestrian_phases: phase.pedestrianPhases,
      },
    });
    const conflict = isRecord(result.output) ? result.output.conflict : undefined;
    const crosswalk =
      typeof conflict === "string" ? /^(CROSSWALK:[A-Z]+)(?::|$)/.exec(conflict)?.[1] : undefined;
    return { ok: isToolOk(result.output), conflictCrosswalkId: crosswalk };
  }

  private executeTool(
    runtime: AgentToolRuntime,
    trace: AgentTraceEvent[],
    tick: number,
    round: number,
    call: JevToolCall,
  ): { readonly output: unknown; readonly commit?: CommitExecution } {
    this.logger.log({
      timestamp: new Date().toISOString(),
      event: "TOOL_CALL",
      tick,
      cycle: this.cycle,
      round,
      payload: { toolName: call.name, arguments: call.arguments },
    });
    const execution = runtime.execute(call.name, JSON.stringify(call.arguments));
    this.logger.log({
      timestamp: new Date().toISOString(),
      event: "TOOL_RESULT",
      tick,
      cycle: this.cycle,
      round,
      payload: { toolName: call.name, output: execution.output },
    });
    trace.push({
      kind: "TOOL_RESULT",
      round,
      data: { toolName: call.name, output: execution.output },
    });
    return {
      output: execution.output,
      ...(execution.commit === undefined ? {} : { commit: execution.commit }),
    };
  }

  private logApi(
    event: "API_REQUEST" | "API_RESPONSE" | "API_ERROR",
    tick: number,
    round: number,
    payload: unknown,
    latencyMs?: number,
  ): void {
    const record = {
      timestamp: new Date().toISOString(),
      event,
      tick,
      cycle: this.cycle,
      round,
      payload,
      ...(latencyMs === undefined ? {} : { latencyMs }),
    };
    this.logger.log(record);
    this.logger.logRaw?.(record);
  }

  private fallback(
    observation: CompactObservation,
    metrics: AgentMetricsCollector,
    trace: AgentTraceEvent[],
  ): AgentCycleResult {
    const admission = this.options.engine.applyAdmissions([]);
    const commit = {
      admission,
      pedestrianPhases: [],
      sleepTicks: 1,
      tacticalSummary: "Safe fallback: no admissions",
    };
    this.remember(observation, commit);
    return {
      commit,
      metrics: metrics.snapshot(),
      trace,
      observation,
      usedFallback: true,
    };
  }

  private remember(observation: CompactObservation, commit: CommitExecution): void {
    this.recentCycles.push({
      cycle: this.cycle,
      tick: observation.currentTick,
      admittedVehicleIds: [...commit.admission.admittedVehicleIds],
      tacticalSummary: commit.tacticalSummary,
    });
    if (this.recentCycles.length > 2) {
      this.recentCycles.shift();
    }
  }

  exportRunnerState(): RunnerCheckpointState {
    return {
      cycle: this.cycle,
      recentCycles: this.recentCycles.map((cycle) => ({ ...cycle })),
      pendingFeedback: [],
      incidents: [...this.incidents.entries()].map(([id, incident]) => ({
        id,
        fact: incident.fact,
        clearanceOrdered: incident.clearanceOrdered,
      })),
    };
  }

  restoreRunnerState(state: RunnerCheckpointState): void {
    this.cycle = state.cycle;
    this.recentCycles.length = 0;
    this.recentCycles.push(...(state.recentCycles as RecentCycle[]));
    this.incidents.clear();
    for (const incident of state.incidents) {
      this.incidents.set(incident.id, {
        fact: incident.fact as JevIncidentFact,
        clearanceOrdered: incident.clearanceOrdered,
      });
    }
  }
}

function sideEffectLabel(call: JevToolCall): string {
  const target =
    call.arguments.incident_id ??
    call.arguments.stalled_vehicle_id ??
    call.arguments.emergency_vehicle_id ??
    call.arguments.severed_lane_id;
  return typeof target === "string" ? `${call.name}:${target}` : call.name;
}

function isToolOk(output: unknown): boolean {
  return isRecord(output) && output.ok === true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
