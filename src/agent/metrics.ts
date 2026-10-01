import type {
  AdmissionBatchResult,
  LaneBatchRequest,
  PedestrianPhaseRequest,
  VehicleSpeedProfileRequest,
  VehicleId,
} from "../core/types.js";

export interface AgentEconomyConfig {
  readonly decisionTax: number;
  readonly toolTax: number;
  readonly recklessAttemptPenalty: number;
  readonly parallelTerminalWarningPenalty: number;
  readonly pedestrianDelayPerTick?: number;
  readonly pedestrianWaitingGraceTicks?: number;
  readonly pedestrianCompletionReward?: number;
  readonly pedestrianJaywalkWavePenalty?: number;
  readonly pedestrianJaywalkerPenalty?: number;
  readonly pedestrianCollisionPenalty?: number;
  readonly initialBalance?: number;
  readonly tollMotorcycle?: number;
  readonly tollStandard?: number;
  readonly tollEmergency?: number;
  readonly emergencyDelayBleedPerTick?: number;
  readonly stallChainStep?: number;
  readonly hazardBleedPerResource?: number;
  readonly secondaryAdmitPenalty?: number;
  readonly delayBleedPerTick?: number;
  readonly upstreamBleedPerTick?: number;
  readonly unservedVehicleLiability?: number;
  readonly schoolBusAccidentPenalty?: number;
  readonly hazmatHazardMultiplier?: number;
  readonly vehicleAggression?: boolean;
  readonly horizonTicks?: number | null;
  /** Absolute tick at which the run is settled; warmup ticks are included. */
  readonly endTick?: number;
}

export interface TokenUsageInput {
  readonly prompt_tokens?: number;
  readonly completion_tokens?: number;
  readonly completion_tokens_details?: {
    readonly reasoning_tokens?: number;
  };
}

export interface TokenCallStats {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly reasoningTokens: number;
  readonly outputTokens: number;
  readonly decodeTokensPerSec: number;
  readonly generationTokensPerSec: number;
}

export interface AgentCycleMetrics {
  readonly apiCalls: number;
  readonly nonTerminalToolCalls: number;
  readonly toolCallsByName: Readonly<Record<string, number>>;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly reasoningTokens: number;
  readonly outputTokens: number;
  readonly avgDecodeTokensPerSec: number;
  readonly maxDecodeTokensPerSec: number;
  readonly avgGenerationTokensPerSec: number;
  readonly maxGenerationTokensPerSec: number;
  readonly wallClockLatencyMs: number;
  readonly decisionTaxCharged: number;
  readonly toolTaxCharged: number;
  readonly penaltiesCharged: number;
  readonly financialDelta: number;
  readonly recklessAttempts: number;
  readonly holdCommits: number;
  readonly unverifiedCommits: number;
  readonly verifiedCommits: number;
  readonly protocolViolations: number;
  readonly warnings: readonly string[];
}

export class AgentMetricsCollector {
  private apiCalls = 0;
  private nonTerminalToolCalls = 0;
  private readonly toolCallsByName = new Map<string, number>();
  private promptTokens = 0;
  private completionTokens = 0;
  private reasoningTokens = 0;
  private outputTokens = 0;
  private wallClockLatencyMs = 0;
  private decisionTaxCharged = 0;
  private toolTaxCharged = 0;
  private penaltiesCharged = 0;
  private recklessAttempts = 0;
  private holdCommits = 0;
  private unverifiedCommits = 0;
  private verifiedCommits = 0;
  private protocolViolations = 0;
  private readonly warnings: string[] = [];
  private readonly decodeRates: number[] = [];
  private readonly generationRates: number[] = [];
  private readonly successfulDryRuns = new Set<string>();

  constructor(private readonly economy: AgentEconomyConfig) {}

  recordApiCall(latencyMs: number, usage?: TokenUsageInput | null): TokenCallStats {
    const stats = describeTokenUsage(usage, latencyMs);
    this.apiCalls += 1;
    this.wallClockLatencyMs += latencyMs;
    this.promptTokens += stats.promptTokens;
    this.completionTokens += stats.completionTokens;
    this.reasoningTokens += stats.reasoningTokens;
    this.outputTokens += stats.outputTokens;
    if (stats.decodeTokensPerSec > 0) {
      this.decodeRates.push(stats.decodeTokensPerSec);
    }
    if (stats.generationTokensPerSec > 0) {
      this.generationRates.push(stats.generationTokensPerSec);
    }
    this.decisionTaxCharged += this.economy.decisionTax;
    return stats;
  }

  recordNonTerminalTool(name: string): void {
    this.nonTerminalToolCalls += 1;
    this.toolCallsByName.set(name, (this.toolCallsByName.get(name) ?? 0) + 1);
    this.toolTaxCharged += this.economy.toolTax;
  }

  recordSuccessfulDryRun(
    vehicleIds: readonly VehicleId[],
    laneBatches: readonly LaneBatchRequest[] = [],
    vehicleSpeedProfiles: readonly VehicleSpeedProfileRequest[] = [],
    pedestrianPhases: readonly PedestrianPhaseRequest[] = [],
  ): void {
    this.successfulDryRuns.add(
      scheduleKey(
        vehicleIds,
        laneBatches,
        vehicleSpeedProfiles,
        pedestrianPhases,
      ),
    );
  }

  recordCommit(
    vehicleIds: readonly VehicleId[],
    laneBatches: readonly LaneBatchRequest[],
    vehicleSpeedProfiles: readonly VehicleSpeedProfileRequest[],
    pedestrianPhases: readonly PedestrianPhaseRequest[],
    result: AdmissionBatchResult,
  ): void {
    this.toolCallsByName.set(
      "commit_schedule",
      (this.toolCallsByName.get("commit_schedule") ?? 0) + 1,
    );
    if (result.rejectedVehicleIds.length > 0) {
      this.recklessAttempts += 1;
      this.penaltiesCharged += this.economy.recklessAttemptPenalty;
      return;
    }
    if (
      vehicleIds.length === 0 &&
      laneBatches.length === 0 &&
      pedestrianPhases.length === 0
    ) {
      this.holdCommits += 1;
      return;
    }
    if (
      this.successfulDryRuns.has(
        scheduleKey(
          vehicleIds,
          laneBatches,
          vehicleSpeedProfiles,
          pedestrianPhases,
        ),
      )
    ) {
      this.verifiedCommits += 1;
    } else {
      this.unverifiedCommits += 1;
    }
  }

  recordParallelTerminalWarning(): void {
    this.recordWarning("warning_parallel_terminal");
    this.penaltiesCharged += this.economy.parallelTerminalWarningPenalty;
  }

  recordWarning(code: string): void {
    this.warnings.push(code);
  }

  recordProtocolViolation(code: string): void {
    this.protocolViolations += 1;
    this.warnings.push(code);
  }

  snapshot(): AgentCycleMetrics {
    return {
      apiCalls: this.apiCalls,
      nonTerminalToolCalls: this.nonTerminalToolCalls,
      toolCallsByName: Object.fromEntries(this.toolCallsByName),
      promptTokens: this.promptTokens,
      completionTokens: this.completionTokens,
      reasoningTokens: this.reasoningTokens,
      outputTokens: this.outputTokens,
      avgDecodeTokensPerSec: average(this.decodeRates),
      maxDecodeTokensPerSec: maximum(this.decodeRates),
      avgGenerationTokensPerSec: average(this.generationRates),
      maxGenerationTokensPerSec: maximum(this.generationRates),
      wallClockLatencyMs: this.wallClockLatencyMs,
      decisionTaxCharged: this.decisionTaxCharged,
      toolTaxCharged: this.toolTaxCharged,
      penaltiesCharged: this.penaltiesCharged,
      financialDelta:
        -this.decisionTaxCharged -
        this.toolTaxCharged -
        this.penaltiesCharged,
      recklessAttempts: this.recklessAttempts,
      holdCommits: this.holdCommits,
      unverifiedCommits: this.unverifiedCommits,
      verifiedCommits: this.verifiedCommits,
      protocolViolations: this.protocolViolations,
      warnings: [...this.warnings],
    };
  }
}

export function describeTokenUsage(
  usage: TokenUsageInput | null | undefined,
  latencyMs: number,
): TokenCallStats {
  const promptTokens = usage?.prompt_tokens ?? 0;
  const completionTokens = usage?.completion_tokens ?? 0;
  const reasoningTokens = usage?.completion_tokens_details?.reasoning_tokens ?? 0;
  const outputTokens = Math.max(0, completionTokens - reasoningTokens);
  const seconds = latencyMs / 1000;
  return {
    promptTokens,
    completionTokens,
    reasoningTokens,
    outputTokens,
    decodeTokensPerSec:
      seconds > 0 && outputTokens > 0 ? outputTokens / seconds : 0,
    generationTokensPerSec:
      seconds > 0 && completionTokens > 0 ? completionTokens / seconds : 0,
  };
}

function scheduleKey(
  vehicleIds: readonly VehicleId[],
  laneBatches: readonly LaneBatchRequest[],
  vehicleSpeedProfiles: readonly VehicleSpeedProfileRequest[],
  pedestrianPhases: readonly PedestrianPhaseRequest[],
): string {
  const explicitProfiles = new Map(
    vehicleIds.map((vehicleId) => [vehicleId, "CRUISE"]),
  );
  for (const request of vehicleSpeedProfiles) {
    explicitProfiles.set(request.vehicleId, request.speedProfile);
  }
  const directions = new Map<string, Set<string>>();
  for (const phase of pedestrianPhases) {
    const values = directions.get(phase.crosswalkId) ?? new Set<string>();
    for (const direction of phase.directions) {
      values.add(direction);
    }
    directions.set(phase.crosswalkId, values);
  }
  return JSON.stringify({
    vehicles: [...new Set(vehicleIds)].sort(),
    vehicleProfiles: [...explicitProfiles.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([vehicleId, speedProfile]) => ({ vehicleId, speedProfile })),
    laneBatches: laneBatches
      .map((batch) => ({
        laneId: batch.laneId,
        topN: batch.topN,
        speedProfile: batch.speedProfile ?? "CRUISE",
      }))
      .sort(
        (left, right) =>
          left.laneId.localeCompare(right.laneId) ||
          left.topN - right.topN ||
          left.speedProfile.localeCompare(right.speedProfile),
      ),
    pedestrianPhases: [...directions.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([crosswalkId, values]) => ({
        crosswalkId,
        directions: [...values].sort(),
      })),
  });
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function maximum(values: readonly number[]): number {
  return values.length === 0 ? 0 : Math.max(...values);
}
