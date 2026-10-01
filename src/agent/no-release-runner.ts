import { config } from "../config.js";
import type { SimulationEngine } from "../core/engine.js";
import {
  AgentMetricsCollector,
  type AgentEconomyConfig,
} from "./metrics.js";
import type {
  AgentCycleInput,
  AgentCycleResult,
  RunnerCheckpointState,
} from "./runner.js";
import { COMMIT_SCHEDULE, type CommitExecution } from "./tools.js";
import type { WorkingMemoryStack } from "./working-memory.js";

/** Matches the longest sleep an agent commit is allowed to request. */
export const NO_RELEASE_SLEEP_TICKS = 10;

const TACTICAL_SUMMARY =
  "No-release test: admit no vehicles and no pedestrians. Sleep 10.";

export class NoReleaseRunner {
  private cycle = 0;

  constructor(
    private readonly options: {
      readonly engine: SimulationEngine;
      readonly memory: WorkingMemoryStack;
      readonly economy?: AgentEconomyConfig;
    },
  ) {}

  async runCycle(input: AgentCycleInput): Promise<AgentCycleResult> {
    this.cycle += 1;
    const peeked = this.options.memory.peek().plan;
    const observation = this.options.engine.buildObservation(
      input.financialBalance,
      input.interruptReason,
      peeked === null
        ? null
        : {
            phaseName: peeked.phaseName,
            targetTick: peeked.targetTick,
            isExpired: this.options.engine.currentTick >= peeked.targetTick,
            depth: this.options.memory.depth,
          },
    );
    const metrics = new AgentMetricsCollector(
      this.options.economy ?? economyFromConfig(),
    );
    const admission = this.options.engine.applyAdmissions([]);
    metrics.recordCommit([], [], [], [], admission);
    const commit: CommitExecution = {
      admission,
      pedestrianPhases: [],
      sleepTicks: NO_RELEASE_SLEEP_TICKS,
      tacticalSummary: TACTICAL_SUMMARY,
    };
    return {
      commit,
      metrics: metrics.snapshot(),
      trace: [
        {
          kind: "MODEL_RESPONSE",
          round: 1,
          data: {
            content: TACTICAL_SUMMARY,
            finishReason: "tool_calls",
            toolCalls: [
              {
                id: `no-release-${this.cycle}`,
                function: {
                  name: COMMIT_SCHEDULE,
                  arguments: JSON.stringify({
                    admit_vehicle_ids: [],
                    lane_batches: [],
                    vehicle_speed_profiles: [],
                    pedestrian_phases: [],
                    sleep_ticks: NO_RELEASE_SLEEP_TICKS,
                    tactical_summary: TACTICAL_SUMMARY,
                  }),
                },
              },
            ],
          },
        },
      ],
      observation,
      usedFallback: false,
    };
  }

  exportRunnerState(): RunnerCheckpointState {
    return {
      cycle: this.cycle,
      recentCycles: [],
      pendingFeedback: [],
      incidents: [],
    };
  }

  restoreRunnerState(state: RunnerCheckpointState): void {
    this.cycle = state.cycle;
  }
}

function economyFromConfig(): AgentEconomyConfig {
  return {
    decisionTax: config.economy.decisionTax,
    toolTax: config.economy.toolTax,
    recklessAttemptPenalty: config.economy.recklessAttemptPenalty,
    parallelTerminalWarningPenalty:
      config.economy.parallelTerminalWarningPenalty,
    pedestrianDelayPerTick: config.economy.pedestrianDelayPerTick,
    pedestrianWaitingGraceTicks: config.economy.pedestrianWaitingGraceTicks,
    pedestrianCompletionReward: config.economy.pedestrianCompletionReward,
    pedestrianJaywalkWavePenalty: config.economy.pedestrianJaywalkWavePenalty,
    pedestrianJaywalkerPenalty: config.economy.pedestrianJaywalkerPenalty,
    pedestrianCollisionPenalty: config.economy.pedestrianCollisionPenalty,
  };
}
