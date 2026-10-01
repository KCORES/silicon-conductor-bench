import "dotenv/config";
import { z } from "zod";
import { CITY_WORLD_EXTENT } from "../apps/replay/src/scene/city/cityConstants.js";
import { STOP_LINE_DISTANCE } from "../apps/replay/src/scene/mainRoadMarkings.js";
import { approachLaneLength } from "./core/approach-length.js";
import { DEFAULT_DYNAMICS, type EngineDynamics } from "./core/dynamics.js";

const booleanFromEnv = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
  .transform((value) => value === true || value === "true" || value === "1");

const environmentSchema = z.object({
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  OPENAI_MODEL: z.string().default(""),
  OPENAI_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  OPENAI_MAX_TOKENS: z.coerce.number().int().positive().default(65_536),
  SIMULATION_SEED: z.coerce.number().int().default(1),
  BENCH_HORIZON_TICKS: z.coerce.number().int().nonnegative().default(400),
  PEDESTRIAN_DEMAND_ENABLED: booleanFromEnv.default(true),
  INITIAL_BALANCE: z.coerce.number().default(1000),
  TOLL_MOTORCYCLE: z.coerce.number().nonnegative().default(0.2),
  TOLL_STANDARD: z.coerce.number().nonnegative().default(0.1),
  TOLL_EMERGENCY: z.coerce.number().nonnegative().default(1),
  DELAY_BLEED_PER_TICK: z.coerce.number().nonnegative().default(0.0002),
  WAITING_CHARGE_GRACE_TICKS: z.coerce.number().int().nonnegative().default(10),
  UPSTREAM_BLEED_PER_TICK: z.coerce.number().nonnegative().default(0.002),
  UNSERVED_VEHICLE_LIABILITY: z.coerce.number().nonnegative().default(0.1),
  DECISION_TAX: z.coerce.number().nonnegative().default(0.02),
  TOOL_TAX: z.coerce.number().nonnegative().default(0.0015),
  RECKLESS_ATTEMPT_PENALTY: z.coerce.number().nonnegative().default(0.15),
  HAZARD_BLEED_PER_RESOURCE: z.coerce.number().nonnegative().default(0.002),
  PEDESTRIAN_DELAY_PER_TICK: z.coerce.number().nonnegative().default(0.001),
  PEDESTRIAN_WAITING_GRACE_TICKS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(10),
  PEDESTRIAN_COMPLETION_REWARD: z.coerce.number().nonnegative().default(0.04),
  PEDESTRIAN_JAYWALK_WAVE_PENALTY: z.coerce
    .number()
    .nonnegative()
    .default(0.5),
  PEDESTRIAN_JAYWALKER_PENALTY: z.coerce
    .number()
    .nonnegative()
    .default(0.1),
  PEDESTRIAN_COLLISION_PENALTY: z.coerce
    .number()
    .nonnegative()
    .default(5),
  SECONDARY_ADMIT_PENALTY: z.coerce.number().nonnegative().default(0.3),
  TOW_DISPATCH_COST: z.coerce.number().nonnegative().default(1.2),
  TOW_CLEARANCE_TICKS: z.coerce.number().int().positive().default(18),
  SCHOOL_BUS_ACCIDENT_PENALTY: z.coerce.number().nonnegative().default(10),
  HAZMAT_HAZARD_MULTIPLIER: z.coerce
    .number()
    .positive()
    .default(DEFAULT_DYNAMICS.hazmatHazardMultiplier),
  VEHICLE_AGGRESSION_ENABLED: booleanFromEnv.default(true),
  STARTUP_LAG_TICKS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(DEFAULT_DYNAMICS.startupLagTicks),
  SLOW_START_STEPS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(DEFAULT_DYNAMICS.slowStartSteps),
  CREEP_AFTER_WAITING_TICKS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_DYNAMICS.creepAfterWaitingTicks),
  EXIT_HOLD_PERIOD: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_DYNAMICS.exitHoldPeriod),
  EXIT_HOLD_DURATION: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(DEFAULT_DYNAMICS.exitHoldDuration),
  EXIT_HOLD_MODULUS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_DYNAMICS.exitHoldModulus),
  CROSSWALK_PERIOD: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_DYNAMICS.crosswalkPeriod),
  CROSSWALK_DURATION: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(DEFAULT_DYNAMICS.crosswalkDuration),
  CROSSWALK_MODULUS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_DYNAMICS.crosswalkModulus),
  STALL_MODULUS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_DYNAMICS.stallModulus),
  EMERGENCY_DELAY_BLEED_PER_TICK: z.coerce.number().nonnegative().default(0.0015),
  STALL_CHAIN_AFTER_TICKS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(DEFAULT_DYNAMICS.stallChainAfterTicks),
  STALL_CHAIN_STEP: z.coerce.number().nonnegative().default(0.0002),
  SCHEDULE_SLIDE_LIMIT_TICKS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_DYNAMICS.scheduleSlideLimitTicks),
  PARALLEL_TERMINAL_WARNING_PENALTY: z.coerce
    .number()
    .nonnegative()
    .default(0.005),
  AGENT_MAX_API_ROUNDS: z.coerce.number().int().min(2).default(8),
  AGENT_MAX_TOOL_CALLS: z.coerce.number().int().positive().default(12),
  AGENT_MEMORY_DEPTH: z.coerce.number().int().positive().default(8),
  AGENT_API_LOG: booleanFromEnv.default(true),
  AGENT_API_LOG_CONSOLE: booleanFromEnv.default(true),
  AGENT_API_LOG_DIR: z.string().min(1).default("logs"),
  AGENT_ARTIFACT_POSTFIX: z.string().default(""),
  OPENAI_REASONING_EFFORT: z
    .union([z.enum(["none", "low", "medium", "high"]), z.literal("")])
    .default("")
    .transform((value) => (value === "" ? undefined : value)),
  AI_GATEWAY_API_KEY: z.string().default(""),
  AI_GATEWAY_BASE_URL: z.string().url().default("https://api.typesafe.ai"),
  AI_GATEWAY_MODEL: z.string().default(""),
  DECISION_BASELINE: z
    .enum(["", "random", "longest-queue", "hold", "balanced", "balanced-bus", "search"])
    .default(""),
  SEARCH_SCREEN_TICKS: z.coerce.number().int().positive().default(12),
  SEARCH_LOOKAHEAD_TICKS: z.coerce.number().int().positive().default(30),
  SEARCH_TOP_K: z.coerce.number().int().positive().default(3),
});

const environment = environmentSchema.parse(process.env);
const modelConnection = resolveModelConnection({
  openaiApiKey: environment.OPENAI_API_KEY,
  openaiBaseURL: environment.OPENAI_BASE_URL,
  openaiModel: environment.OPENAI_MODEL,
  gatewayApiKey: environment.AI_GATEWAY_API_KEY,
  gatewayBaseURL: environment.AI_GATEWAY_BASE_URL,
  gatewayModel: environment.AI_GATEWAY_MODEL,
});

export type ReasoningFormat = "deepseek-style";
export type ReasoningEffort = "none" | "low" | "medium" | "high";
export type ModelProvider = "openai" | "jev";

export interface ProviderRequestProfile {
  readonly reasoningEffort?: ReasoningEffort;
  readonly replayReasoningContent: boolean;
}

export interface ModelConnection {
  readonly provider: ModelProvider;
  readonly apiKey: string;
  readonly baseURL: string;
  readonly model: string;
}

const TYPESAFE_API_HOST = "api.typesafe.ai";

export function detectModelProvider(
  model: string,
  baseURL: string,
): ModelProvider {
  if (/^jev(?:-|$)/i.test(model.trim())) {
    return "jev";
  }
  try {
    if (new URL(baseURL).hostname.toLowerCase() === TYPESAFE_API_HOST) {
      return "jev";
    }
  } catch {
    return "openai";
  }
  return "openai";
}

export function resolveModelConnection(input: {
  readonly openaiApiKey: string;
  readonly openaiBaseURL: string;
  readonly openaiModel: string;
  readonly gatewayApiKey: string;
  readonly gatewayBaseURL: string;
  readonly gatewayModel: string;
}): ModelConnection {
  const useGateway = input.gatewayModel.trim().length > 0;
  const model = (useGateway ? input.gatewayModel : input.openaiModel).trim();
  return {
    provider: detectModelProvider(
      model,
      useGateway ? input.gatewayBaseURL : input.openaiBaseURL,
    ),
    apiKey: useGateway ? input.gatewayApiKey : input.openaiApiKey,
    baseURL: useGateway ? input.gatewayBaseURL : input.openaiBaseURL,
    model,
  };
}

export function isCerebrasHost(baseURL: string): boolean {
  try {
    const hostname = new URL(baseURL).hostname.toLowerCase();
    return hostname === "cerebras.ai" || hostname.endsWith(".cerebras.ai");
  } catch {
    return false;
  }
}

export function resolveProviderRequestProfile(
  baseURL: string,
  reasoningEffort: ReasoningEffort | undefined,
): ProviderRequestProfile {
  if (!isCerebrasHost(baseURL)) {
    return { replayReasoningContent: true };
  }
  return {
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    replayReasoningContent: false,
  };
}

export function detectReasoningFormat(
  baseURL: string,
  model: string,
): ReasoningFormat | undefined {
  let isStepFunHost = false;
  try {
    const hostname = new URL(baseURL).hostname.toLowerCase();
    isStepFunHost =
      hostname === "stepfun.com" || hostname.endsWith(".stepfun.com");
  } catch {
    isStepFunHost = false;
  }
  return isStepFunHost || /^step(?:-|$)/i.test(model)
    ? "deepseek-style"
    : undefined;
}

const decisionBaseline =
  environment.DECISION_BASELINE === "" ? undefined : environment.DECISION_BASELINE;
const providerRequestProfile = resolveProviderRequestProfile(
  environment.OPENAI_BASE_URL,
  environment.OPENAI_REASONING_EFFORT,
);

export const config = {
  provider: decisionBaseline === undefined ? modelConnection.provider : "baseline",
  baseline: decisionBaseline,
  search: {
    screenTicks: environment.SEARCH_SCREEN_TICKS,
    lookaheadTicks: environment.SEARCH_LOOKAHEAD_TICKS,
    topK: environment.SEARCH_TOP_K,
  },
  jev: {
    apiKey: modelConnection.provider === "jev" ? modelConnection.apiKey : "",
    baseURL:
      modelConnection.provider === "jev"
        ? modelConnection.baseURL
        : "https://api.typesafe.ai",
    model: modelConnection.provider === "jev" ? modelConnection.model : "",
    timeoutMs: environment.OPENAI_TIMEOUT_MS,
  },
  openai: {
    apiKey: environment.OPENAI_API_KEY,
    baseURL: environment.OPENAI_BASE_URL,
    model: environment.OPENAI_MODEL,
    timeoutMs: environment.OPENAI_TIMEOUT_MS,
    maxTokens: environment.OPENAI_MAX_TOKENS,
    reasoningFormat: detectReasoningFormat(
      environment.OPENAI_BASE_URL,
      environment.OPENAI_MODEL,
    ),
    reasoningEffort: providerRequestProfile.reasoningEffort,
    replayReasoningContent: providerRequestProfile.replayReasoningContent,
  },
  simulation: {
    seed: environment.SIMULATION_SEED,
    horizonTicks: environment.BENCH_HORIZON_TICKS,
    pedestrianDemandEnabled: environment.PEDESTRIAN_DEMAND_ENABLED,
    microTickMs: 100,
    minSleepTicks: 1,
    maxSleepTicks: 10,
    inboundLaneLength: approachLaneLength(CITY_WORLD_EXTENT, STOP_LINE_DISTANCE),
    outboundLaneLength: approachLaneLength(CITY_WORLD_EXTENT, STOP_LINE_DISTANCE),
    queueWarningOccupancyRatio: 0.8,
    startupLagTicks: environment.STARTUP_LAG_TICKS,
    slowStartSteps: environment.SLOW_START_STEPS,
    creepAfterWaitingTicks: environment.CREEP_AFTER_WAITING_TICKS,
    waitingChargeGraceTicks: environment.WAITING_CHARGE_GRACE_TICKS,
    exitHoldPeriod: environment.EXIT_HOLD_PERIOD,
    exitHoldDuration: environment.EXIT_HOLD_DURATION,
    exitHoldModulus: environment.EXIT_HOLD_MODULUS,
    crosswalkPeriod: environment.CROSSWALK_PERIOD,
    crosswalkDuration: environment.CROSSWALK_DURATION,
    crosswalkModulus: environment.CROSSWALK_MODULUS,
    stallModulus: environment.STALL_MODULUS,
    stallChainAfterTicks: environment.STALL_CHAIN_AFTER_TICKS,
    scheduleSlideLimitTicks: environment.SCHEDULE_SLIDE_LIMIT_TICKS,
    towClearanceTicks: environment.TOW_CLEARANCE_TICKS,
    vehicleAggressionEnabled: environment.VEHICLE_AGGRESSION_ENABLED,
  },
  economy: {
    initialBalance: environment.INITIAL_BALANCE,
    tollMotorcycle: environment.TOLL_MOTORCYCLE,
    tollStandard: environment.TOLL_STANDARD,
    tollEmergency: environment.TOLL_EMERGENCY,
    delayBleedPerTick: environment.DELAY_BLEED_PER_TICK,
    upstreamBleedPerTick: environment.UPSTREAM_BLEED_PER_TICK,
    unservedVehicleLiability: environment.UNSERVED_VEHICLE_LIABILITY,
    decisionTax: environment.DECISION_TAX,
    toolTax: environment.TOOL_TAX,
    recklessAttemptPenalty: environment.RECKLESS_ATTEMPT_PENALTY,
    hazardBleedPerResource: environment.HAZARD_BLEED_PER_RESOURCE,
    pedestrianDelayPerTick: environment.PEDESTRIAN_DELAY_PER_TICK,
    pedestrianWaitingGraceTicks:
      environment.PEDESTRIAN_WAITING_GRACE_TICKS,
    pedestrianCompletionReward:
      environment.PEDESTRIAN_COMPLETION_REWARD,
    pedestrianJaywalkWavePenalty:
      environment.PEDESTRIAN_JAYWALK_WAVE_PENALTY,
    pedestrianJaywalkerPenalty:
      environment.PEDESTRIAN_JAYWALKER_PENALTY,
    pedestrianCollisionPenalty:
      environment.PEDESTRIAN_COLLISION_PENALTY,
    secondaryAdmitPenalty: environment.SECONDARY_ADMIT_PENALTY,
    towDispatchCost: environment.TOW_DISPATCH_COST,
    schoolBusAccidentPenalty: environment.SCHOOL_BUS_ACCIDENT_PENALTY,
    hazmatHazardMultiplier: environment.HAZMAT_HAZARD_MULTIPLIER,
    emergencyDelayBleedPerTick: environment.EMERGENCY_DELAY_BLEED_PER_TICK,
    stallChainStep: environment.STALL_CHAIN_STEP,
    parallelTerminalWarningPenalty:
      environment.PARALLEL_TERMINAL_WARNING_PENALTY,
  },
  agent: {
    maxApiRounds: environment.AGENT_MAX_API_ROUNDS,
    maxToolCalls: environment.AGENT_MAX_TOOL_CALLS,
    memoryDepth: environment.AGENT_MEMORY_DEPTH,
    apiLog: environment.AGENT_API_LOG,
    apiLogConsole: environment.AGENT_API_LOG_CONSOLE,
    apiLogDir: environment.AGENT_API_LOG_DIR,
    artifactPostfix: environment.AGENT_ARTIFACT_POSTFIX,
  },
} as const;

export type AppConfig = typeof config;

export function engineDynamicsFromConfig(): EngineDynamics {
  return {
    startupLagTicks: config.simulation.startupLagTicks,
    slowStartSteps: config.simulation.slowStartSteps,
    creepAfterWaitingTicks: config.simulation.creepAfterWaitingTicks,
    waitingChargeGraceTicks: config.simulation.waitingChargeGraceTicks,
    exitHoldPeriod: config.simulation.exitHoldPeriod,
    exitHoldDuration: config.simulation.exitHoldDuration,
    exitHoldModulus: config.simulation.exitHoldModulus,
    exitHoldPreview: DEFAULT_DYNAMICS.exitHoldPreview,
    crosswalkPeriod: config.simulation.crosswalkPeriod,
    crosswalkDuration: config.simulation.crosswalkDuration,
    crosswalkModulus: config.simulation.crosswalkModulus,
    crosswalkPreview: DEFAULT_DYNAMICS.crosswalkPreview,
    stallModulus: config.simulation.stallModulus,
    stallChainAfterTicks: config.simulation.stallChainAfterTicks,
    stallChainStep: config.economy.stallChainStep,
    emergencyDelayBleedPerTick: config.economy.emergencyDelayBleedPerTick,
    laneGuidanceNearSlots: DEFAULT_DYNAMICS.laneGuidanceNearSlots,
    laneGuidanceFarSlots: DEFAULT_DYNAMICS.laneGuidanceFarSlots,
    scheduleSlideLimitTicks: config.simulation.scheduleSlideLimitTicks,
    vehicleAggression: config.simulation.vehicleAggressionEnabled,
    hazmatHazardMultiplier: config.economy.hazmatHazardMultiplier,
  };
}
