import type { AgentCycleMetrics } from "./metrics.js";

export interface AgentSettlementCosts {
  readonly api: number;
  readonly tools: number;
  readonly penalties: number;
  readonly delay: number;
  readonly emergencyDelay: number;
  readonly stallChain: number;
  readonly upstream: number;
  readonly hazard: number;
  readonly exitLock: number;
  readonly tow: number;
  readonly secondary: number;
  readonly pedestrianDelay: number;
  readonly pedestrianJaywalk: number;
  readonly pedestrianStrike: number;
  readonly schoolBus: number;
}

export interface AgentSettlementSummary {
  readonly cycle: number;
  readonly startingBalance: number;
  readonly endingBalance: number;
  readonly revenue: number;
  readonly pedestrianReward: number;
  readonly costs: AgentSettlementCosts;
  readonly netDelta: number;
}

export interface AgentSettlementInput {
  readonly cycle: number;
  readonly startingBalance: number;
  readonly endingBalance: number;
  readonly revenue: number;
  readonly metrics: Pick<
    AgentCycleMetrics,
    "decisionTaxCharged" | "toolTaxCharged" | "penaltiesCharged"
  >;
  readonly delay: number;
  readonly emergencyDelay: number;
  readonly stallChain: number;
  readonly upstream: number;
  readonly hazard: number;
  readonly exitLock: number;
  readonly tow: number;
  readonly secondary: number;
  readonly pedestrianDelay?: number;
  readonly pedestrianReward?: number;
  readonly pedestrianJaywalk?: number;
  readonly pedestrianStrike?: number;
  readonly schoolBus?: number;
}

export function buildAgentSettlementSummary(
  input: AgentSettlementInput,
): AgentSettlementSummary {
  return {
    cycle: input.cycle,
    startingBalance: input.startingBalance,
    endingBalance: input.endingBalance,
    revenue: input.revenue,
    pedestrianReward: input.pedestrianReward ?? 0,
    costs: {
      api: input.metrics.decisionTaxCharged,
      tools: input.metrics.toolTaxCharged,
      penalties: input.metrics.penaltiesCharged,
      delay: input.delay,
      emergencyDelay: input.emergencyDelay,
      stallChain: input.stallChain,
      upstream: input.upstream,
      hazard: input.hazard,
      exitLock: input.exitLock,
      tow: input.tow,
      secondary: input.secondary,
      pedestrianDelay: input.pedestrianDelay ?? 0,
      pedestrianJaywalk: input.pedestrianJaywalk ?? 0,
      pedestrianStrike: input.pedestrianStrike ?? 0,
      schoolBus: input.schoolBus ?? 0,
    },
    netDelta: input.endingBalance - input.startingBalance,
  };
}
