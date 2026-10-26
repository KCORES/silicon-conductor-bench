import { config } from "../../config.js";
import type { CompactObservation } from "../../core/types.js";
import type { SimulationEngine } from "../../core/engine.js";
import { createArtifactIdentity } from "../../io/artifacts.js";
import {
  createDefaultAgentApiLogger,
  type AgentApiLogger,
} from "../api-logger.js";
import { formatLastError } from "../http-error-body.js";
import {
  AgentMetricsCollector,
  type AgentEconomyConfig,
} from "../metrics.js";
import type { AgentCycleInput, AgentCycleResult, AgentTraceEvent, RunnerCheckpointState } from "../runner.js";
import { buildAgentObservationPayload, buildTrafficSystemPrompt } from "../runner.js";
import { laneVehicleCounts } from "../model-observation.js";
import { buildJevParameterQuestions, applyJevParameters } from "./parameters.js";
import { pedestrianWindowRisks } from "./pedestrian-window.js";
import {
  COMMIT_SCHEDULE,
  DRY_RUN_ADMIT,
  INSPECT_INCIDENT,
  DRY_RUN_QUOTA_PER_CYCLE,
  selectAgentTools,
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
  type PhaseSelection,
} from "./compile.js";
import {
  buildJevQuestions,
  buildJevState,
  ADAPT_CROSSWALK,
  ADAPT_JAYWALK_GUARD,
  ADAPT_RESERVATIONS,
  ADAPT_PARITY_INPUT,
  ADAPT_FEEDBACK,
  ADAPT_CONDITIONAL,
  ADAPT_HORIZON_SHRINK,
  ADAPT_PEDESTRIAN_WINDOW,
  ADAPT_REPAIR_TAILGATE,
  type JevIncidentFact,
  type PhaseCandidate,
} from "./questions.js";

interface RecentCycle {
  readonly cycle: number;
  readonly tick: number;
  readonly admittedVehicleIds: readonly string[];
  readonly tacticalSummary: string;
  readonly sleepTicks?: number;
  readonly balance?: number;
  readonly notices?: readonly string[];
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
  readonly maxApiRounds?: number;
  readonly maxToolCalls?: number;
  readonly tollMotorcycle: number;
  readonly tollStandard: number;
  readonly tollEmergency: number;
  readonly towDispatchCost?: number;
  readonly towClearanceTicks?: number;
  readonly logger?: AgentApiLogger;
  readonly onActivity?: (activity: string) => void;
  readonly onError?: (message: string) => void;
}

export class JevAgentRunner {
  private readonly recentCycles: RecentCycle[] = [];
  private readonly incidents = new Map<string, CachedIncident>();
  private readonly logger: AgentApiLogger;
  private readonly deciderName: string;
  private cycle = 0;
  private previousLaneCounts: ReadonlyMap<string, number> | undefined;
  private readonly pendingFeedback: string[] = [];
  private publicState: Record<string, unknown> = {};
  private toolCalls = 0;
  private dryRunCalls = 0;

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
    this.toolCalls = 0;
    this.dryRunCalls = 0;
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
    if (this.options.client !== undefined && ADAPT_PARITY_INPUT) {
      const snapshot = this.options.engine.spatialSnapshot();
      this.publicState = buildAgentObservationPayload({ observation,
        ...(this.options.economy.endTick === undefined ? {} : { endTick: this.options.economy.endTick }),
        spatial: { snapshot, ...(this.previousLaneCounts === undefined ? {} : { previousLaneCounts: this.previousLaneCounts }) },
        recentCycles: [...this.recentCycles], previousFeedback: this.pendingFeedback.splice(0),
        lastSettlement: input.lastSettlement ?? null,
      });
      this.previousLaneCounts = laneVehicleCounts(snapshot);
    }
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
      allowReservedLanes: this.options.client !== undefined && ADAPT_RESERVATIONS,
      flexiblePhases: this.options.client !== undefined && ADAPT_CONDITIONAL,
      incidents: this.openIncidentFacts(runtime, trace, tick, round, observation),
      ...(ADAPT_CROSSWALK && this.options.client !== undefined
        ? { crosswalkSlots: this.options.engine.spatialSnapshot().crosswalks }
        : {}),
    });

    const answers = await this.decide(build, observation, metrics, trace, tick, round);
    if (answers === undefined) {
      return this.fallback(observation, metrics, trace);
    }

    let schedule = compileJevSchedule(build.facts, answers);
    let apiRound = 1;
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
    let selection: PhaseSelection;
    if (this.options.client !== undefined && (ADAPT_FEEDBACK || ADAPT_CONDITIONAL)) {
      const rejectedKeys: string[] = [];
      selection = { phase: undefined, rejectedKeys };
      // A fresh model answer conditions phase, release and sleep on actual tool
      // feedback. Side effects execute only once, never replayed on a repair.
      for (let attempt = 1; attempt <= DRY_RUN_QUOTA_PER_CYCLE; attempt++) {
        let phase = schedule.rankedPhases[0];
        if (phase === undefined) break;
        if (ADAPT_CONDITIONAL) {
          if (apiRound >= (this.options.maxApiRounds ?? config.agent.maxApiRounds)) break;
          const parameters = await this.decide({ ...build, questions: buildJevParameterQuestions(phase) },
            observation, metrics, trace, tick, ++apiRound,
            { decisionStage: "parameters", selectedPhase: phase });
          if (parameters === undefined) return this.fallback(observation, metrics, trace);
          const plan = applyJevParameters(phase, parameters);
          phase = plan.phase;
          schedule = { ...schedule, sleepTicks: plan.sleepTicks };
        }
        if (phase.kind === "HOLD") break;
        const checked = this.dryRun(runtime, trace, tick, apiRound, phase, schedule.topN, observation);
        if (checked.ok) { selection = { phase, rejectedKeys }; break; }
        rejectedKeys.push(phase.key);
        if (!ADAPT_FEEDBACK || attempt >= DRY_RUN_QUOTA_PER_CYCLE ||
            apiRound + (ADAPT_CONDITIONAL ? 2 : 1) > (this.options.maxApiRounds ?? config.agent.maxApiRounds) ||
            this.toolCalls >= (this.options.maxToolCalls ?? config.agent.maxToolCalls)) break;
        const repaired = await this.decide(build, observation, metrics, trace, tick, ++apiRound);
        if (repaired === undefined) return this.fallback(observation, metrics, trace);
        schedule = compileJevSchedule(build.facts, repaired);
      }
    } else {
      selection = selectVerifiedPhase(schedule.rankedPhases, (phase) =>
        this.dryRun(runtime, trace, tick, round, phase, schedule.topN, observation),
        this.options.client !== undefined && ADAPT_HORIZON_SHRINK
          ? { horizonShrinkTopN: schedule.topN } : {},
      );
    }
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
    const committed = this.executeTool(runtime, trace, tick, apiRound, commitCall);
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
    extraState: Readonly<Record<string, unknown>> = {},
  ): Promise<Readonly<Record<string, JevAnswer>> | undefined> {
    if (this.options.baseline !== undefined) {
      this.options.onActivity?.("baseline");
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
      state: { ...buildJevState({
        observation,
        facts: build.facts,
        recentCycles: this.recentCycles,
      }), ...(ADAPT_PARITY_INPUT ? {
        ...this.publicState,
        rules: buildTrafficSystemPrompt(this.options.maxApiRounds ?? config.agent.maxApiRounds, this.options.economy),
        tools: selectAgentTools(observation),
        toolFeedback: trace.filter(event => event.kind === "TOOL_RESULT").map(event => event.data),
        remainingToolCalls: Math.max(0, (this.options.maxToolCalls ?? config.agent.maxToolCalls) - this.toolCalls),
        remainingDryRuns: Math.max(0, DRY_RUN_QUOTA_PER_CYCLE - this.dryRunCalls),
        ...(round > 1 ? { repairInstructions: "The previous admission plan failed or exposed jaywalkers. Use the toolFeedback to select a corrected phase and release size. A smaller wave, another lane, or fewer crosswalks may work. If no safe plan remains, choose HOLD. Side-effect actions already ran; do not repeat them. Sleep must match the corrected plan." } : {}),
      } : {}), ...(ADAPT_CONDITIONAL ? { decisionStage: "phase" } : {}), ...extraState },
      questions: ADAPT_CONDITIONAL && extraState.decisionStage !== "parameters"
        ? Object.fromEntries(Object.entries(build.questions).filter(([key]) => key !== "release_size" && key !== "sleep"))
        : build.questions,
    };
    this.logApi("API_REQUEST", tick, round, requestPayload);
    trace.push({ kind: "API_REQUEST", round, data: requestPayload });
    const startedAt = performance.now();
    this.options.onActivity?.("request");
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
      const body = error instanceof JevApiError ? error.body : undefined;
      const errorPayload = {
        message: error instanceof Error ? error.message : String(error),
        ...(status === undefined ? {} : { status }),
        ...(body === undefined ? {} : { body }),
      };
      metrics.recordApiCall(latencyMs);
      metrics.recordProtocolViolation("api_error");
      this.options.onError?.(formatLastError(error, body));
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
    observation: CompactObservation,
  ): JevIncidentFact[] {
    // Incident IDs come from the public observation, never a private engine scan.
    const open = new Set(observation.blockedRoutes.flatMap(route => route.incidentIds ?? []));
    for (const incidentId of open) {
      if (this.incidents.has(incidentId)) {
        continue;
      }
      const result = this.executeTool(runtime, trace, tick, round, {
        name: INSPECT_INCIDENT,
        arguments: { incident_id: incidentId },
      });
      if (!isToolOk(result.output) || !isRecord(result.output)) {
        continue;
      }
      const severedLaneIds = stringList(result.output.severed_routes).flatMap((routeId) => {
        const laneId = this.options.engine.network.trajectories.get(routeId)?.inboundLaneId;
        return laneId === undefined ? [] : [laneId];
      });
      const lockedCrosswalkIds = stringList(result.output.locked_crosswalks);
      this.incidents.set(incidentId, {
        fact: {
          incidentId,
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
    observation: CompactObservation,
  ): PhaseProbeResult {
    const batches = laneBatchesFor(phase, topN);
    const result = this.executeTool(runtime, trace, tick, round, {
      name: DRY_RUN_ADMIT,
      arguments: {
        candidate_vehicle_ids: [],
        lane_batches: batches,
        vehicle_speed_profiles: [],
        pedestrian_phases: phase.pedestrianPhases,
      },
    });
    const conflict = isRecord(result.output) ? result.output.conflict : undefined;
    // Reservations exclude jaywalkers, so `ok` alone is not a safe admission.
    // Removing a pedestrian phase cannot repair a vehicle's route through them.
    if (ADAPT_JAYWALK_GUARD && this.options.client !== undefined &&
        isRecord(result.output) && Array.isArray(result.output.jaywalker_warnings) &&
        result.output.jaywalker_warnings.length > 0) {
      return { ok: false };
    }
    if (ADAPT_REPAIR_TAILGATE && this.options.client !== undefined &&
        /:(HEAD_ONLY|WINDOW_HEADS)$/.test(phase.key) && isToolOk(result.output) && isRecord(result.output) &&
        Array.isArray(result.output.tailgate_risk) && result.output.tailgate_risk.length > 0) {
      trace.push({ kind: "PROTOCOL_WARNING", round, data: {
        reason: "REPAIR_TAILGATE_RISK", phase: phase.key, risks: result.output.tailgate_risk,
      } });
      return { ok: false };
    }
    if (ADAPT_PEDESTRIAN_WINDOW && this.options.client !== undefined && isToolOk(result.output) && isRecord(result.output)) {
      const plans: unknown[] = Array.isArray(result.output.vehicle_plans) ? result.output.vehicle_plans : [];
      const checks = phase.lanes.map(lane => {
        const head = observation.stoplineCandidates.find(candidate => candidate.lane === lane.laneId);
        const headPlans = plans.filter(plan => Array.isArray(plan) && head !== undefined && plan[0] === head.vehicleId);
        const crossed = lane.crosswalkIds ?? [];
        const headSafe = headPlans.length === 1 && pedestrianWindowRisks(observation, crossed, headPlans).length === 0;
        // Top-1 is exactly identifiable from the public stopline head. For
        // followers the tool omits lane IDs, so keep the conservative bound.
        const checkedPlans = batches.find(batch => batch.lane_id === lane.laneId)?.top_n === 1 && headPlans.length === 1 ? headPlans : plans;
        return { laneId: lane.laneId, headSafe, risks: pedestrianWindowRisks(observation, crossed, checkedPlans) };
      });
      const risks = checks.flatMap(check => check.risks);
      if (risks.length > 0) {
        const windowRepairLaneIds = checks.filter(check => check.headSafe).map(check => check.laneId);
        trace.push({ kind: "PROTOCOL_WARNING", round, data: { reason: "PEDESTRIAN_WINDOW_RISK", phase: phase.key, risks, windowRepairLaneIds } });
        return { ok: false, windowRepairLaneIds };
      }
    }
    const crosswalk =
      typeof conflict === "string" ? /^(CROSSWALK:[A-Z]+)(?::|$)/.exec(conflict)?.[1] : undefined;
    const error = isRecord(result.output) ? result.output.error : undefined;
    const horizonExceeded = isRecord(error) && error.tool_name === DRY_RUN_ADMIT &&
      error.code === "TOOL_EXECUTION_ERROR" && typeof error.message === "string" &&
      /^Admission planning horizon exceeded for \S+$/.test(error.message);
    return { ok: isToolOk(result.output), conflictCrosswalkId: crosswalk, horizonExceeded };
  }

  private executeTool(
    runtime: AgentToolRuntime,
    trace: AgentTraceEvent[],
    tick: number,
    round: number,
    call: JevToolCall,
  ): { readonly output: unknown; readonly commit?: CommitExecution } {
    if (call.name !== COMMIT_SCHEDULE) {
      if (this.toolCalls >= (this.options.maxToolCalls ?? config.agent.maxToolCalls)) {
        return { output: { ok: false, reason: "TOOL_CALL_LIMIT_EXHAUSTED" } };
      }
      this.toolCalls += 1;
      if (call.name === DRY_RUN_ADMIT) this.dryRunCalls += 1;
    }
    this.options.onActivity?.(
      /^[A-Za-z0-9_-]+$/.test(call.name) ? `tool:${call.name}` : "tool_call",
    );
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
      data: { toolName: call.name, arguments: call.arguments, output: execution.output },
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
      sleepTicks: commit.sleepTicks,
      balance: observation.financialBalance,
      notices: observation.emergencyNotices.map(notice => `${notice.vehicleId}:${notice.kind}`),
    });
    if (this.recentCycles.length > 2) {
      this.recentCycles.shift();
    }
  }

  exportRunnerState(): RunnerCheckpointState {
    return {
      cycle: this.cycle,
      recentCycles: this.recentCycles.map((cycle) => ({ ...cycle })),
      pendingFeedback: [...this.pendingFeedback],
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
    this.pendingFeedback.splice(0, this.pendingFeedback.length, ...state.pendingFeedback);
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
