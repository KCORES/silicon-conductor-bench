import OpenAI from "openai";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  FileAgentApiLogger,
  SilentAgentApiLogger,
  type AgentApiLogger,
} from "./agent/api-logger.js";
import {
  createBaselineDecider,
  type BaselineDecider,
} from "./agent/jev/baselines.js";
import { JevClient } from "./agent/jev/client.js";
import { JevAgentRunner } from "./agent/jev/runner.js";
import { createSearchDecider } from "./agent/jev/search.js";
import { NoReleaseRunner } from "./agent/no-release-runner.js";
import { ToolCallAgentRunner } from "./agent/runner.js";
import {
  buildAgentSettlementSummary,
  type AgentSettlementSummary,
} from "./agent/settlement.js";
import {
  persistWorkingMemoryToStore,
  WorkingMemoryStack,
} from "./agent/working-memory.js";
import {
  BenchmarkArgsError,
  parseBenchmarkArgs,
  shouldUseBenchTui,
} from "./benchmark-args.js";
import { config, engineDynamicsFromConfig } from "./config.js";
import { arrivalsAt } from "./core/demand.js";
import { SimulationEngine } from "./core/engine.js";
import { createRoadNetwork, defaultRouteIds } from "./core/network.js";
import { createRunArtifactStore, RunArtifactStore } from "./io/artifacts.js";
import {
  appendReplayPart,
  loadResume,
  readReplayParts,
  rewriteReplayParts,
  writeBenchCheckpoint,
  writeRunManifest,
  type BenchCheckpoint,
} from "./io/run-checkpoint.js";
import { writeReplayBundle } from "./io/replay-writer.js";
import { writeBenchmarkReport } from "./io/report-writer.js";
import { ReplayRecorder } from "./replay/recorder.js";
import { VehicleLedger } from "./replay/vehicle-ledger.js";
import { createReplayScene } from "./replay/geometry.js";
import { renderIntersection } from "./tui/render-intersection.js";
import { radarFrom } from "./tui/radar.js";
import {
  benchTiming,
  mountBenchLiveView,
  waitForBenchFrame,
  type BenchLiveSession,
  type BenchPhase,
  type BenchStatus,
} from "./tui/live-session.js";
import { formatDuration } from "./tui/render-console.js";
import type { Vehicle } from "./core/types.js";
import { violationForfeitsToll } from "./core/drivers.js";
import { rewardTollForVehicle } from "./core/vehicleRoster.js";

const WARMUP_TICKS = config.simulation.inboundLaneLength;

interface CycleSummary {
  usedFallback: boolean;
  apiCalls: number;
  nonTerminalToolCalls: number;
  verifiedCommits: number;
  unverifiedCommits: number;
  holdCommits: number;
  recklessAttempts: number;
  admitted: readonly unknown[];
  rejected: readonly unknown[];
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  outputTokens: number;
  avgDecodeTokensPerSec: number;
  avgGenerationTokensPerSec: number;
  [key: string]: unknown;
}

async function main(): Promise<void> {
  let cycleCount: number;
  let horizonTicks: number | null;
  let seed: number;
  let plain: boolean;
  let noRelease: boolean;
  let resumePath: string | null;
  try {
    ({
      cycleCount,
      horizonTicks,
      seed,
      plain,
      noRelease,
      resume: resumePath,
    } = parseBenchmarkArgs(
      process.argv.slice(2),
      config.simulation.seed,
      config.simulation.horizonTicks,
    ));
  } catch (error) {
    if (error instanceof BenchmarkArgsError) {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
  if (
    !noRelease &&
    config.provider === "jev" &&
    (config.jev.apiKey.length === 0 || config.jev.model.length === 0)
  ) {
    throw new Error(
      "AI_GATEWAY_API_KEY and AI_GATEWAY_MODEL must be set in .env",
    );
  }
  if (
    !noRelease &&
    config.provider === "openai" &&
    (config.openai.apiKey.length === 0 || config.openai.model.length === 0)
  ) {
    throw new Error("OPENAI_API_KEY and OPENAI_MODEL must be set in .env");
  }
  let resumed: ReturnType<typeof loadResume> | undefined;
  if (resumePath !== null) {
    try {
      resumed = loadResume(resumePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${message}\n`);
      process.exit(1);
    }
    cycleCount = resumed.checkpoint.cycleCount;
    horizonTicks = resumed.checkpoint.horizonTicks ?? null;
    seed = resumed.checkpoint.seed;
  }
  const endTick =
    horizonTicks === null ? undefined : WARMUP_TICKS + horizonTicks;

  const baseModelName = noRelease
    ? "no-release"
    : config.baseline !== undefined
      ? `baseline-${config.baseline}`
      : config.provider === "jev"
        ? config.jev.model
        : config.openai.model;
  const modelName = config.simulation.pedestrianDemandEnabled
    ? baseModelName
    : `${baseModelName}-no-ped`;

  const store = resumed === undefined
    ? createRunArtifactStore({
        directory: config.agent.apiLogDir,
        model: modelName,
        ...(config.agent.artifactPostfix.length > 0
          ? { postfix: config.agent.artifactPostfix }
          : {}),
      })
    : new RunArtifactStore(dirname(resumed.apiLogPath), resumed.identity);
  const useTui = shouldUseBenchTui(plain, Boolean(process.stdout.isTTY));
  let session: BenchLiveSession | undefined;
  const logger = new FileAgentApiLogger({
    enabled: config.agent.apiLog,
    consoleEnabled:
      process.env.BENCH_QUIET_CONSOLE === "1"
        ? false
        : config.agent.apiLogConsole,
    directory: store.directory,
    identity: store.identity,
    ...(useTui
      ? {
          print: (text: string) => {
            session?.pushLog(text);
          },
        }
      : {}),
  });
  if (logger.path !== undefined && !existsSync(logger.path)) {
    mkdirSync(dirname(logger.path), { recursive: true });
    writeFileSync(logger.path, "", "utf8");
  }
  const memory = new WorkingMemoryStack(config.agent.memoryDepth, {
    persist: persistWorkingMemoryToStore(store),
  });
  const engine = new SimulationEngine({
    network: createRoadNetwork({
      inboundLaneLength: config.simulation.inboundLaneLength,
      outboundLaneLength: config.simulation.outboundLaneLength,
    }),
    seed,
    dynamics: engineDynamicsFromConfig(),
  });
  const agentEconomy = {
    decisionTax: config.economy.decisionTax,
    toolTax: config.economy.toolTax,
    recklessAttemptPenalty: config.economy.recklessAttemptPenalty,
    parallelTerminalWarningPenalty:
      config.economy.parallelTerminalWarningPenalty,
    pedestrianDelayPerTick: config.economy.pedestrianDelayPerTick,
    pedestrianWaitingGraceTicks:
      config.economy.pedestrianWaitingGraceTicks,
    pedestrianCompletionReward:
      config.economy.pedestrianCompletionReward,
    pedestrianJaywalkWavePenalty:
      config.economy.pedestrianJaywalkWavePenalty,
    pedestrianJaywalkerPenalty:
      config.economy.pedestrianJaywalkerPenalty,
    pedestrianCollisionPenalty:
      config.economy.pedestrianCollisionPenalty,
    initialBalance: config.economy.initialBalance,
    tollMotorcycle: config.economy.tollMotorcycle,
    tollStandard: config.economy.tollStandard,
    tollEmergency: config.economy.tollEmergency,
    emergencyDelayBleedPerTick: config.economy.emergencyDelayBleedPerTick,
    stallChainStep: config.economy.stallChainStep,
    hazardBleedPerResource: config.economy.hazardBleedPerResource,
    secondaryAdmitPenalty: config.economy.secondaryAdmitPenalty,
    delayBleedPerTick: config.economy.delayBleedPerTick,
    upstreamBleedPerTick: config.economy.upstreamBleedPerTick,
    unservedVehicleLiability: config.economy.unservedVehicleLiability,
    schoolBusAccidentPenalty: config.economy.schoolBusAccidentPenalty,
    hazmatHazardMultiplier: config.economy.hazmatHazardMultiplier,
    vehicleAggression: config.simulation.vehicleAggressionEnabled,
    horizonTicks,
    ...(endTick === undefined ? {} : { endTick }),
  };
  const createJevRunner = (
    runnerEngine: SimulationEngine,
    runnerMemory: WorkingMemoryStack,
    decider:
      | { readonly baseline: BaselineDecider; readonly deciderName: string }
      | { readonly client: JevClient; readonly deciderName: string },
    runnerLogger: AgentApiLogger,
  ): JevAgentRunner =>
    new JevAgentRunner({
      ...decider,
      engine: runnerEngine,
      memory: runnerMemory,
      model: modelName,
      economy: agentEconomy,
      tollMotorcycle: config.economy.tollMotorcycle,
      tollStandard: config.economy.tollStandard,
      tollEmergency: config.economy.tollEmergency,
      towDispatchCost: config.economy.towDispatchCost,
      towClearanceTicks: config.simulation.towClearanceTicks,
      logger: runnerLogger,
    });
  const vehicleToll = (type: Vehicle["type"]): number =>
    rewardTollForVehicle(
      type,
      config.economy.tollMotorcycle,
      config.economy.tollStandard,
      config.economy.tollEmergency,
    );
  let searchRunner: JevAgentRunner | undefined;
  const silentLogger = new SilentAgentApiLogger();
  const searchDecider = (): BaselineDecider =>
    createSearchDecider({
      engine,
      memory,
      memoryDepth: config.agent.memoryDepth,
      seed,
      endTick,
      pedestrianDemandEnabled: config.simulation.pedestrianDemandEnabled,
      economy: {
        delayBleedPerTick: config.economy.delayBleedPerTick,
        upstreamBleedPerTick: config.economy.upstreamBleedPerTick,
        hazardBleedPerResource: config.economy.hazardBleedPerResource,
        secondaryAdmitPenalty: config.economy.secondaryAdmitPenalty,
        schoolBusAccidentPenalty: config.economy.schoolBusAccidentPenalty,
        unservedVehicleLiability: config.economy.unservedVehicleLiability,
        toll: vehicleToll,
        pedestrianRates: pedestrianEconomyRates(),
      },
      screenTicks: config.search.screenTicks,
      lookaheadTicks: config.search.lookaheadTicks,
      topK: config.search.topK,
      runnerState: () => {
        if (searchRunner === undefined) {
          throw new Error("search runner is not ready");
        }
        return searchRunner.exportRunnerState();
      },
      createEngine: () =>
        new SimulationEngine({
          network: engine.network,
          seed,
          dynamics: engineDynamicsFromConfig(),
        }),
      createRunner: (runnerEngine, runnerMemory, decider) =>
        createJevRunner(
          runnerEngine,
          runnerMemory,
          { baseline: decider, deciderName: "search-rollout" },
          silentLogger,
        ),
      onDecision: (report) => {
        if (process.env.BENCH_SEARCH_TRACE === "1") {
          process.stderr.write(
            `[search] tick=${report.tick} best=${report.best === undefined ? "balanced" : `${report.best.phaseKey}/${report.best.release}/${report.best.sleep}${report.best.emergency === undefined ? "" : `/e${report.best.emergency}`}`} value=${report.bestValue.toFixed(3)} balanced=${report.balancedValue.toFixed(3)} evaluated=${report.evaluated}\n`,
          );
        }
      },
    });
  const runner = noRelease
    ? new NoReleaseRunner({ engine, memory })
    : config.provider === "jev" || config.baseline !== undefined
      ? (searchRunner = createJevRunner(
          engine,
          memory,
          config.baseline === "search"
            ? { baseline: searchDecider(), deciderName: "search" }
            : config.baseline !== undefined
              ? {
                  baseline: createBaselineDecider(config.baseline, seed),
                  deciderName: config.baseline,
                }
              : {
                  client: new JevClient({
                    apiKey: config.jev.apiKey,
                    baseURL: config.jev.baseURL,
                    model: config.jev.model,
                    timeoutMs: config.jev.timeoutMs,
                  }),
                  deciderName: "jev",
                },
          logger,
        ))
      : new ToolCallAgentRunner({
          client: new OpenAI({
            apiKey: config.openai.apiKey,
            baseURL: config.openai.baseURL,
            timeout: config.openai.timeoutMs,
            maxRetries: 0,
          }),
          engine,
          memory,
          model: modelName,
          ...(config.openai.reasoningFormat === undefined
            ? {}
            : { reasoningFormat: config.openai.reasoningFormat }),
          ...(config.openai.reasoningEffort === undefined
            ? {}
            : { reasoningEffort: config.openai.reasoningEffort }),
          replayReasoningContent: config.openai.replayReasoningContent,
          maxTokens: config.openai.maxTokens,
          maxApiRounds: config.agent.maxApiRounds,
          maxToolCalls: config.agent.maxToolCalls,
          economy: agentEconomy,
          tollMotorcycle: config.economy.tollMotorcycle,
          tollStandard: config.economy.tollStandard,
          tollEmergency: config.economy.tollEmergency,
          towDispatchCost: config.economy.towDispatchCost,
          towClearanceTicks: config.simulation.towClearanceTicks,
          logger,
        });
  const recorder = new ReplayRecorder({
    network: engine.network,
    identity: store.identity,
    model: modelName,
    seed,
    tickDurationMs: config.simulation.microTickMs,
    warmupTicks: WARMUP_TICKS,
    slowStartSteps: config.simulation.slowStartSteps,
  });

  const saved = resumed?.checkpoint;
  if (saved === undefined) {
    engine.setPedestrianPatienceFrozen(true);
    warmup(engine, recorder, seed);
    engine.setPedestrianPatienceFrozen(false);
  } else {
    engine.restoreCheckpoint(saved.engine);
    memory.restore(saved.workingMemory);
    runner.restoreRunnerState(saved.runner);
    const parts = readReplayParts(resumed?.replayPartPath ?? "");
    const kept = parts.slice(0, saved.completedCycles + 1);
    if (resumed !== undefined) {
      rewriteReplayParts(resumed.replayPartPath, kept);
    }
    recorder.loadReplayParts(kept);
  }
  let balance = saved?.balance ?? config.economy.initialBalance;
  const ledger = new VehicleLedger();
  const pedestrianLedger = new VehicleLedger();
  if (saved !== undefined) {
    ledger.restoreEntries(saved.ledgers.vehicles);
    pedestrianLedger.restoreEntries(saved.ledgers.pedestrians);
  }
  let interruptReason: string | undefined = saved?.interruptReason ?? undefined;
  let hazardBleedCharged = saved?.accumulators.hazardBleedCharged ?? 0;
  let secondaryPenaltiesCharged = saved?.accumulators.secondaryPenaltiesCharged ?? 0;
  let towingCostsCharged = saved?.accumulators.towingCostsCharged ?? 0;
  let emergencyBleedCharged = saved?.accumulators.emergencyBleedCharged ?? 0;
  let stallChainBleedCharged = saved?.accumulators.stallChainBleedCharged ?? 0;
  let upstreamBleedCharged = saved?.accumulators.upstreamBleedCharged ?? 0;
  let exitLockBleedCharged = saved?.accumulators.exitLockBleedCharged ?? 0;
  let pedestrianDelayCharged = saved?.accumulators.pedestrianDelayCharged ?? 0;
  let pedestrianRewardsEarned = saved?.accumulators.pedestrianRewardsEarned ?? 0;
  let pedestrianJaywalkPenaltiesCharged =
    saved?.accumulators.pedestrianJaywalkPenaltiesCharged ?? 0;
  let pedestrianStrikePenaltiesCharged =
    saved?.accumulators.pedestrianStrikePenaltiesCharged ?? 0;
  let schoolBusPenaltiesCharged = saved?.accumulators.schoolBusPenaltiesCharged ?? 0;
  let violationExits = saved?.accumulators.violationExits ?? 0;
  const cycleSummaries: CycleSummary[] =
    saved === undefined ? [] : [...(saved.cycleSummaries as CycleSummary[])];
  const startedAt = saved?.startedAtMs ?? Date.now();
  let completedCycles = saved?.completedCycles ?? 0;
  let completedAtMs = saved?.completedAtMs ?? startedAt;
  let lastSettlement: AgentSettlementSummary | null =
    (saved?.lastSettlement as AgentSettlementSummary | null | undefined) ?? null;

  const apiLogPath = logger.path === undefined ? "disabled" : resolve(logger.path);
  process.stderr.write(
    `[bench] start model=${modelName} seed=${seed} cycles=${cycleCount} horizonTicks=${horizonTicks ?? "none"} maxApiRounds=${config.agent.maxApiRounds} artifacts=${store.directory} apiLog=${apiLogPath}\n`,
  );
  if (noRelease) {
    process.stderr.write(
      "[bench] no-release: hold every vehicle and pedestrian, sleep 10 unless the world interrupts, no decision tax\n",
    );
  }

  const scene = createReplayScene(engine.network);
  let tacticalSummary = saved?.tacticalSummary ?? "";
  const frameStatus = (phase: BenchPhase, cycle: number): BenchStatus => {
    const peeked = memory.peek().plan;
    const observation = engine.buildObservation(
      balance,
      interruptReason,
      peeked === null
        ? null
        : {
            phaseName: peeked.phaseName,
            targetTick: peeked.targetTick,
            isExpired: engine.currentTick >= peeked.targetTick,
            depth: memory.depth,
          },
    );
    return {
      map: renderIntersection(engine.network, engine.vehicles.values(), scene, {
        crosswalkHolds: observation.crosswalkHolds,
        upstreamQueues: observation.upstreamQueues,
      }),
      cycle,
      cycleCount,
      tick: engine.currentTick,
      seed,
      balance,
      phase,
      tacticalSummary,
      interruptReason: interruptReason ?? "",
      radar: radarFrom(observation, engine.vehicles.values()),
      startedAtMs: startedAt,
      completedCycles,
      completedAtMs,
    };
  };
  const publish = (phase: BenchPhase, cycle: number): void => {
    session?.update(frameStatus(phase, cycle));
  };
  if (useTui) {
    session = mountBenchLiveView(frameStatus("thinking", 0));
  }

  const persistProgress = (): void => {
    appendReplayPart(store, recorder.drainReplayPart());
    const checkpoint: BenchCheckpoint = {
      version: 1,
      completedCycles,
      cycleCount,
      horizonTicks,
      seed,
      balance,
      interruptReason: interruptReason ?? null,
      tacticalSummary,
      startedAtMs: startedAt,
      completedAtMs,
      accumulators: {
        hazardBleedCharged,
        secondaryPenaltiesCharged,
        towingCostsCharged,
        emergencyBleedCharged,
        stallChainBleedCharged,
        upstreamBleedCharged,
        exitLockBleedCharged,
        pedestrianDelayCharged,
        pedestrianRewardsEarned,
        pedestrianJaywalkPenaltiesCharged,
        pedestrianStrikePenaltiesCharged,
        schoolBusPenaltiesCharged,
        violationExits,
      },
      cycleSummaries,
      lastSettlement,
      ledgers: {
        vehicles: ledger.exportEntries(),
        pedestrians: pedestrianLedger.exportEntries(),
      },
      workingMemory: memory.snapshot(),
      runner: runner.exportRunnerState(),
      engine: engine.exportCheckpoint(),
    };
    writeBenchCheckpoint(store, checkpoint);
    memory.restore(checkpoint.workingMemory);
  };
  if (saved === undefined) {
    writeRunManifest(store, {
      seed,
      cycleCount,
      horizonTicks,
      dotenvPath: process.env.DOTENV_CONFIG_PATH ?? "",
      argv: process.argv.slice(2),
      model: modelName,
      apiLog: apiLogPath,
    });
    persistProgress();
  }

  try {
    for (
      let cycle = completedCycles + 1;
      cycle <= cycleCount &&
      (endTick === undefined || engine.currentTick < endTick);
      cycle += 1
    ) {
      recordScheduledDemand(engine, recorder, seed);
      publish("thinking", cycle);
      const startingBalance = balance;
      const result = await runner.runCycle({
        financialBalance: balance,
        ...(interruptReason === undefined ? {} : { interruptReason }),
        lastSettlement,
      });
      interruptReason = undefined;
      tacticalSummary = result.commit.tacticalSummary;
      flushIncidentLog(engine, recorder);
      flushPedestrianEvents(engine, recorder);
      const towingCost = engine.consumeTowCharges();
      balance -= towingCost;
      towingCostsCharged += towingCost;
      const secondaryCount = engine.consumeSecondaryAdmitCount();
      const secondaryCost =
        secondaryCount * config.economy.secondaryAdmitPenalty;
      balance -= secondaryCost;
      secondaryPenaltiesCharged += secondaryCost;
      const schoolBusCost =
        engine.consumeSchoolBusAccidents() *
        config.economy.schoolBusAccidentPenalty;
      balance -= schoolBusCost;
      schoolBusPenaltiesCharged += schoolBusCost;
      recorder.recordCycle(result, engine.vehicles, balance);
      balance += result.metrics.financialDelta;
      pedestrianLedger.settleActors(
        [...engine.pedestrians.values()]
          .filter((pedestrian) => pedestrian.state !== "WAITING")
          .map((pedestrian) => pedestrian.id),
      );
      recorder.recordFrame(
        engine.currentTick,
        engine.vehicles.values(),
        engine.pedestrians.values(),
        "decision",
        {
          financialBalance: balance,
          scores: ledger.scores(),
          pedestrianScores: pedestrianLedger.scores(),
        },
      );
      publish("advancing", cycle);

      let despawned = 0;
      let cycleHazard = 0;
      let cycleEmergency = 0;
      let cycleStallChain = 0;
      let cycleUpstream = 0;
      let cycleExitLock = 0;
      let cycleDelay = 0;
      let cycleRevenue = 0;
      let cyclePedestrianDelay = 0;
      let cyclePedestrianReward = 0;
      let cyclePedestrianJaywalk = 0;
      let cyclePedestrianStrike = 0;
      const stepBudget =
        endTick === undefined
          ? result.commit.sleepTicks
          : Math.min(result.commit.sleepTicks, endTick - engine.currentTick);
      for (let step = 0; step < stepBudget; step += 1) {
        recordScheduledDemand(engine, recorder, seed);
        const settlement = engine.collectWaitingSettlement(
          config.economy.delayBleedPerTick,
          config.economy.upstreamBleedPerTick,
        );
        const waiting = settlement.totals;
        const waitingCost =
          waiting.delay + waiting.emergency + waiting.stallChain + waiting.upstream;
        balance -= waitingCost;
        ledger.applyCharges(settlement.vehicles);
        cycleDelay += waiting.delay;
        cycleEmergency += waiting.emergency;
        cycleStallChain += waiting.stallChain;
        cycleUpstream += waiting.upstream;
        const stepped = engine.step();
        const pedestrianSettlement = engine.collectPedestrianSettlement(
          pedestrianEconomyRates(),
        );
        pedestrianLedger.applyCharges(
          [...engine.pedestrians.values()]
            .filter(
              (pedestrian) =>
                pedestrian.state === "WAITING" &&
                pedestrian.waitingTicks >
                  config.economy.pedestrianWaitingGraceTicks,
            )
            .map((pedestrian) => ({
              vehicleId: pedestrian.id,
              amount: config.economy.pedestrianDelayPerTick,
            })),
        );
        pedestrianLedger.settleActors(
          [...engine.pedestrians.values()]
            .filter((pedestrian) => pedestrian.state !== "WAITING")
            .map((pedestrian) => pedestrian.id),
        );
        balance +=
          pedestrianSettlement.completionRevenue -
          pedestrianSettlement.delayCost -
          pedestrianSettlement.jaywalkCost -
          pedestrianSettlement.collisionCost;
        cyclePedestrianDelay += pedestrianSettlement.delayCost;
        cyclePedestrianReward +=
          pedestrianSettlement.completionRevenue;
        cyclePedestrianJaywalk += pedestrianSettlement.jaywalkCost;
        cyclePedestrianStrike += pedestrianSettlement.collisionCost;
        for (const vehicleId of stepped.enteredVehicleIds) {
          const vehicle = engine.vehicles.get(vehicleId);
          recorder.recordWorldEvent("ADMIT", engine.currentTick, {
            vehicleId,
            routeId: vehicle?.routeId,
            scheduled: true,
          });
        }
        ledger.settleOutbound(engine.vehicles.values(), vehicleToll);
        const hazardCost =
          engine.hazardResourceUnits() * config.economy.hazardBleedPerResource;
        const exitLockCost =
          engine.exitLockedResourceCount() * config.economy.hazardBleedPerResource;
        balance -= hazardCost + exitLockCost;
        cycleHazard += hazardCost;
        cycleExitLock += exitLockCost;
        recorder.recordDespawns(stepped.despawnEvents);
        flushIncidentLog(engine, recorder);
        flushPedestrianEvents(engine, recorder);
        for (const event of stepped.despawnEvents) {
          despawned += 1;
          if (event.violation !== undefined) {
            violationExits += 1;
          }
          const reward = violationForfeitsToll(event.violation)
            ? 0
            : vehicleToll(event.vehicleType);
          balance += reward;
          cycleRevenue += reward;
        }
        recorder.recordFrame(
          engine.currentTick,
          engine.vehicles.values(),
          engine.pedestrians.values(),
          "tick",
          {
            financialBalance: balance,
            scores: ledger.scores(),
            pedestrianScores: pedestrianLedger.scores(),
          },
        );
        if (stepped.interruptReason !== undefined) {
          interruptReason = stepped.interruptReason;
        }
        publish("advancing", cycle);
        if (useTui) {
          await waitForBenchFrame();
        }
        if (stepped.interruptReason !== undefined) {
          break;
        }
      }
      hazardBleedCharged += cycleHazard;
      emergencyBleedCharged += cycleEmergency;
      stallChainBleedCharged += cycleStallChain;
      upstreamBleedCharged += cycleUpstream;
      exitLockBleedCharged += cycleExitLock;
      pedestrianDelayCharged += cyclePedestrianDelay;
      pedestrianRewardsEarned += cyclePedestrianReward;
      pedestrianJaywalkPenaltiesCharged += cyclePedestrianJaywalk;
      pedestrianStrikePenaltiesCharged += cyclePedestrianStrike;
      lastSettlement = buildAgentSettlementSummary({
        cycle,
        startingBalance,
        endingBalance: balance,
        revenue: cycleRevenue,
        pedestrianReward: cyclePedestrianReward,
        metrics: result.metrics,
        delay: cycleDelay,
        emergencyDelay: cycleEmergency,
        stallChain: cycleStallChain,
        upstream: cycleUpstream,
        hazard: cycleHazard,
        exitLock: cycleExitLock,
        tow: towingCost,
        secondary: secondaryCost,
        pedestrianDelay: cyclePedestrianDelay,
        pedestrianJaywalk: cyclePedestrianJaywalk,
        pedestrianStrike: cyclePedestrianStrike,
        schoolBus: schoolBusCost,
      });

      const summary = {
        cycle,
        tick: engine.currentTick,
        sleepTicks: result.commit.sleepTicks,
        usedFallback: result.usedFallback,
        admitted: result.commit.admission.admittedVehicleIds,
        rejected: result.commit.admission.rejectedVehicleIds,
        tacticalSummary: result.commit.tacticalSummary,
        apiCalls: result.metrics.apiCalls,
        nonTerminalToolCalls: result.metrics.nonTerminalToolCalls,
        verifiedCommits: result.metrics.verifiedCommits,
        unverifiedCommits: result.metrics.unverifiedCommits,
        holdCommits: result.metrics.holdCommits,
        recklessAttempts: result.metrics.recklessAttempts,
        warnings: result.metrics.warnings,
        financialDelta: Number((balance - startingBalance).toFixed(4)),
        balance: Number(balance.toFixed(4)),
        despawned,
        hazardBleed: Number(cycleHazard.toFixed(4)),
        emergencyBleed: Number(cycleEmergency.toFixed(4)),
        stallChainBleed: Number(cycleStallChain.toFixed(4)),
        upstreamBleed: Number(cycleUpstream.toFixed(4)),
        exitLockBleed: Number(cycleExitLock.toFixed(4)),
        secondaryPenalty: Number(secondaryCost.toFixed(4)),
        towingCost: Number(towingCost.toFixed(4)),
        pedestrianDelay: Number(cyclePedestrianDelay.toFixed(4)),
        pedestrianReward: Number(cyclePedestrianReward.toFixed(4)),
        pedestrianJaywalk: Number(cyclePedestrianJaywalk.toFixed(4)),
        pedestrianStrike: Number(cyclePedestrianStrike.toFixed(4)),
        schoolBusPenalty: Number(schoolBusCost.toFixed(4)),
        interruptReason: interruptReason ?? null,
      };
      cycleSummaries.push({
        ...summary,
        financialDelta: Number((balance - startingBalance).toFixed(4)),
        delayBleedCharged: Number(cycleDelay.toFixed(4)),
        promptTokens: result.metrics.promptTokens,
        completionTokens: result.metrics.completionTokens,
        reasoningTokens: result.metrics.reasoningTokens,
        outputTokens: result.metrics.outputTokens,
        avgDecodeTokensPerSec: Number(
          result.metrics.avgDecodeTokensPerSec.toFixed(2),
        ),
        avgGenerationTokensPerSec: Number(
          result.metrics.avgGenerationTokensPerSec.toFixed(2),
        ),
      });
      completedCycles = cycle;
      completedAtMs = Date.now();
      const timing = benchTiming(
        endTick === undefined || horizonTicks === null
          ? { startedAtMs: startedAt, completedCycles, completedAtMs, cycleCount }
          : {
              startedAtMs: startedAt,
              completedCycles: engine.currentTick - WARMUP_TICKS,
              completedAtMs,
              cycleCount: horizonTicks,
            },
        completedAtMs,
      );
      const eta =
        timing.estimatedRemainingMs === null
          ? "calculating"
          : formatDuration(timing.estimatedRemainingMs);
      const tickProgress =
        horizonTicks === null
          ? ""
          : ` ticks=${engine.currentTick - WARMUP_TICKS}/${horizonTicks}`;
      const cycleLine = `[bench] cycle=${cycle}/${cycleCount}${tickProgress} tick=${engine.currentTick} fallback=${result.usedFallback} admitted=${result.commit.admission.admittedVehicleIds.length} rejected=${result.commit.admission.rejectedVehicleIds.length} api=${result.metrics.apiCalls} tools=${result.metrics.nonTerminalToolCalls} tok=${result.metrics.promptTokens}/${result.metrics.completionTokens} dec/s=${result.metrics.avgDecodeTokensPerSec.toFixed(1)} sleep=${result.commit.sleepTicks} balance=${balance.toFixed(2)} elapsed=${formatDuration(timing.elapsedMs)} eta=${eta}`;
      if (useTui) {
        session?.pushLog(cycleLine);
      } else {
        process.stderr.write(`${cycleLine}\n`);
      }
      persistProgress();
    }
  } finally {
    session?.unmount();
  }

  const terminal = engine.terminalSettlement(
    (vehicle) => vehicleToll(vehicle.type),
    config.economy.unservedVehicleLiability,
  );
  balance +=
    terminal.outboundToll + terminal.crossingToll - terminal.unservedLiability;
  process.stderr.write(
    `[bench] final tick=${engine.currentTick} balance=${balance.toFixed(2)} terminalToll=${(terminal.outboundToll + terminal.crossingToll).toFixed(2)} unserved=${terminal.unservedOnMap}+${terminal.unservedUpstream} passengers=${terminal.unservedPassengers} liability=${terminal.unservedLiability.toFixed(2)}\n`,
  );

  const replayPath = writeReplayBundle(store, recorder.finalize());
  const reportPath = writeBenchmarkReport(store, {
    model: modelName,
    seed,
    cycleCount,
    horizonTicks,
    endTick: engine.currentTick,
    pedestrianDemandEnabled: config.simulation.pedestrianDemandEnabled,
    maxApiRounds: config.agent.maxApiRounds,
    elapsedMs: Date.now() - startedAt,
    initialBalance: config.economy.initialBalance,
    finalBalance: Number(balance.toFixed(4)),
    terminal: {
      outboundToll: Number(terminal.outboundToll.toFixed(4)),
      crossingToll: Number(terminal.crossingToll.toFixed(4)),
      unservedOnMap: terminal.unservedOnMap,
      unservedUpstream: terminal.unservedUpstream,
      unservedPassengers: terminal.unservedPassengers,
      unservedLiability: Number(terminal.unservedLiability.toFixed(4)),
    },
    totals: {
      fallbacks: cycleSummaries.filter((item) => item.usedFallback).length,
      apiCalls: cycleSummaries.reduce((sum, item) => sum + item.apiCalls, 0),
      toolCalls: cycleSummaries.reduce(
        (sum, item) => sum + item.nonTerminalToolCalls,
        0,
      ),
      verifiedCommits: cycleSummaries.reduce(
        (sum, item) => sum + item.verifiedCommits,
        0,
      ),
      unverifiedCommits: cycleSummaries.reduce(
        (sum, item) => sum + item.unverifiedCommits,
        0,
      ),
      holdCommits: cycleSummaries.reduce(
        (sum, item) => sum + item.holdCommits,
        0,
      ),
      recklessAttempts: cycleSummaries.reduce(
        (sum, item) => sum + item.recklessAttempts,
        0,
      ),
      admittedVehicles: cycleSummaries.reduce(
        (sum, item) => sum + item.admitted.length,
        0,
      ),
      rejectedVehicles: cycleSummaries.reduce(
        (sum, item) => sum + item.rejected.length,
        0,
      ),
      promptTokens: cycleSummaries.reduce(
        (sum, item) => sum + item.promptTokens,
        0,
      ),
      completionTokens: cycleSummaries.reduce(
        (sum, item) => sum + item.completionTokens,
        0,
      ),
      reasoningTokens: cycleSummaries.reduce(
        (sum, item) => sum + item.reasoningTokens,
        0,
      ),
      outputTokens: cycleSummaries.reduce(
        (sum, item) => sum + item.outputTokens,
        0,
      ),
      avgDecodeTokensPerSec: Number(
        (
          cycleSummaries.reduce(
            (sum, item) => sum + item.avgDecodeTokensPerSec,
            0,
          ) / cycleSummaries.length
        ).toFixed(2),
      ),
      hazardBleed: Number(hazardBleedCharged.toFixed(4)),
      emergencyBleed: Number(emergencyBleedCharged.toFixed(4)),
      stallChainBleed: Number(stallChainBleedCharged.toFixed(4)),
      upstreamBleed: Number(upstreamBleedCharged.toFixed(4)),
      exitLockBleed: Number(exitLockBleedCharged.toFixed(4)),
      secondaryPenalties: Number(secondaryPenaltiesCharged.toFixed(4)),
      towingCosts: Number(towingCostsCharged.toFixed(4)),
      pedestrianDelay: Number(pedestrianDelayCharged.toFixed(4)),
      pedestrianReward: Number(pedestrianRewardsEarned.toFixed(4)),
      pedestrianJaywalk: Number(
        pedestrianJaywalkPenaltiesCharged.toFixed(4),
      ),
      pedestrianStrike: Number(
        pedestrianStrikePenaltiesCharged.toFixed(4),
      ),
      schoolBusPenalties: Number(schoolBusPenaltiesCharged.toFixed(4)),
      violationExits,
      aggression: engine.aggressionSummary(),
    },
    incidents: engine.incidentSummaries(),
    replayPath,
    cycles: cycleSummaries,
  });

  process.stderr.write(`[bench] apiLog=${logger.path ?? "disabled"}\n`);
  process.stderr.write(`[bench] rawApiLog=${logger.rawPath ?? "disabled"}\n`);
  process.stderr.write(`[bench] report=${reportPath}\n`);
  process.stderr.write(`[bench] replay=${replayPath}\n`);
}

function warmup(
  engine: SimulationEngine,
  recorder: ReplayRecorder,
  seed: number,
): void {
  recorder.recordFrame(
    engine.currentTick,
    engine.vehicles.values(),
    engine.pedestrians.values(),
    "tick",
    { financialBalance: config.economy.initialBalance },
  );
  for (let tick = 0; tick < WARMUP_TICKS; tick += 1) {
    recordScheduledDemand(engine, recorder, seed);
    const stepped = engine.step();
    engine.collectPedestrianSettlement(pedestrianEconomyRates());
    recorder.recordDespawns(stepped.despawnEvents);
    flushIncidentLog(engine, recorder);
    flushPedestrianEvents(engine, recorder);
    recorder.recordFrame(
      engine.currentTick,
      engine.vehicles.values(),
      engine.pedestrians.values(),
      "tick",
      { financialBalance: config.economy.initialBalance },
    );
  }
}

function recordScheduledDemand(
  engine: SimulationEngine,
  recorder: ReplayRecorder,
  seed: number,
): void {
  recorder.recordSpawns(
    engine.currentTick,
    applyScheduledDemand(engine, seed),
  );
  if (config.simulation.pedestrianDemandEnabled) {
    engine.generatePedestrianDemand();
  }
  flushPedestrianEvents(engine, recorder);
}

function applyScheduledDemand(
  engine: SimulationEngine,
  seed: number,
): Vehicle[] {
  const before = new Set(engine.vehicles.keys());
  engine.drainUpstreamQueues();
  for (const arrival of arrivalsAt(
    seed,
    engine.currentTick,
    defaultRouteIds(engine.network),
  )) {
    engine.spawnScheduled(arrival);
  }
  return [...engine.vehicles.values()].filter(
    (vehicle) => !before.has(vehicle.id),
  );
}

function flushIncidentLog(
  engine: SimulationEngine,
  recorder: ReplayRecorder,
): void {
  for (const entry of engine.drainIncidentLog()) {
    recorder.recordWorldEvent(entry.kind, entry.tick, entry);
  }
}

function flushPedestrianEvents(
  engine: SimulationEngine,
  recorder: ReplayRecorder,
): void {
  for (const event of engine.drainPedestrianEvents()) {
    recorder.recordWorldEvent(event.kind, event.tick, event);
  }
}

function pedestrianEconomyRates() {
  return {
    delayPerTick: config.economy.pedestrianDelayPerTick,
    waitingGraceTicks:
      config.economy.pedestrianWaitingGraceTicks,
    completionReward: config.economy.pedestrianCompletionReward,
    jaywalkWavePenalty:
      config.economy.pedestrianJaywalkWavePenalty,
    jaywalkerPenalty:
      config.economy.pedestrianJaywalkerPenalty,
    collisionPenalty:
      config.economy.pedestrianCollisionPenalty,
  };
}

await main();
