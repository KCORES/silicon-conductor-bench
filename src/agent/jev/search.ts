import { arrivalsAt } from "../../core/demand.js";
import { violationForfeitsToll } from "../../core/drivers.js";
import type { EngineCheckpoint, SimulationEngine } from "../../core/engine.js";
import { defaultRouteIds } from "../../core/network.js";
import type { VehicleType } from "../../core/types.js";
import type { RunnerCheckpointState } from "../runner.js";
import { WorkingMemoryStack, type WorkingMemorySnapshot } from "../working-memory.js";
import {
  balancedAnswers,
  balancedOrder,
  certain,
  rankedChoice,
  type BaselineDecider,
} from "./baselines.js";
import type { JevAnswer } from "./client.js";
import type { JevAgentRunner } from "./runner.js";
import {
  EMERGENCY_CLEAR_KEY,
  PHASE_KEY,
  RELEASE_KEY,
  RELEASE_OPTIONS,
  SLEEP_KEY,
  SLEEP_OPTIONS,
  type JevQuestionBuild,
  type ReleaseOption,
  type SleepOption,
} from "./questions.js";

export interface SearchEconomy {
  readonly delayBleedPerTick: number;
  readonly upstreamBleedPerTick: number;
  readonly hazardBleedPerResource: number;
  readonly secondaryAdmitPenalty: number;
  readonly schoolBusAccidentPenalty: number;
  readonly unservedVehicleLiability: number;
  readonly toll: (type: VehicleType) => number;
  readonly pedestrianRates: Parameters<SimulationEngine["collectPedestrianSettlement"]>[0];
}

export interface SearchContext {
  readonly engine: SimulationEngine;
  readonly memory: WorkingMemoryStack;
  readonly memoryDepth: number;
  readonly seed: number;
  readonly endTick: number | undefined;
  readonly pedestrianDemandEnabled: boolean;
  readonly economy: SearchEconomy;
  /** Ticks simulated per candidate in the coarse pass over phase and release size. */
  readonly screenTicks: number;
  /** Ticks simulated per candidate in the refinement pass. */
  readonly lookaheadTicks: number;
  /** Phase and release pairs kept from the coarse pass for refinement. */
  readonly topK: number;
  readonly runnerState: () => RunnerCheckpointState;
  readonly createEngine: () => SimulationEngine;
  readonly createRunner: (
    engine: SimulationEngine,
    memory: WorkingMemoryStack,
    decider: BaselineDecider,
  ) => JevAgentRunner;
  readonly onDecision?: (report: SearchDecisionReport) => void;
}

export interface SearchCandidate {
  readonly phaseKey: string;
  readonly release: ReleaseOption;
  readonly sleep: SleepOption;
  readonly emergency?: 0 | 1;
}

export interface SearchDecisionReport {
  readonly tick: number;
  readonly best: SearchCandidate | undefined;
  readonly bestValue: number;
  readonly balancedValue: number;
  readonly evaluated: number;
}

interface RootState {
  readonly engine: EngineCheckpoint;
  readonly memory: WorkingMemorySnapshot;
  readonly runner: RunnerCheckpointState;
}

/**
 * Picks each decision by simulating candidate answers forward on a cloned
 * engine and continuing with the balanced policy. Rollouts see the exact
 * future demand, so the result estimates what a planner with a perfect model
 * of the simulator could reach inside the JEV action space.
 */
export function createSearchDecider(context: SearchContext): BaselineDecider {
  return async (build) => {
    const root: RootState = {
      engine: context.engine.exportCheckpoint(),
      memory: context.memory.snapshot(),
      runner: context.runnerState(),
    };
    const tick = context.engine.currentTick;
    const evaluate = (candidate: SearchCandidate | undefined, ticks: number) =>
      rollout(context, root, candidate, ticks);

    const balancedValue = await evaluate(undefined, context.lookaheadTicks);
    const screened: { candidate: SearchCandidate; value: number }[] = [];
    for (const candidate of screenCandidates(build)) {
      screened.push({ candidate, value: await evaluate(candidate, context.screenTicks) });
    }
    screened.sort((left, right) => right.value - left.value);

    let best: SearchCandidate | undefined;
    let bestValue = balancedValue;
    let evaluated = 1 + screened.length;
    for (const { candidate } of screened.slice(0, context.topK)) {
      for (const refined of refineCandidates(build, candidate)) {
        const value = await evaluate(refined, context.lookaheadTicks);
        evaluated += 1;
        if (value > bestValue) {
          best = refined;
          bestValue = value;
        }
      }
    }
    context.onDecision?.({ tick, best, bestValue, balancedValue, evaluated });
    return best === undefined ? balancedAnswers(build) : candidateAnswers(build, best);
  };
}

function screenCandidates(build: JevQuestionBuild): SearchCandidate[] {
  const releases = Object.keys(RELEASE_OPTIONS) as ReleaseOption[];
  return build.facts.phases.flatMap((phase) =>
    phase.kind === "VEHICLE" && build.facts.askRelease
      ? releases.map((release) => ({ phaseKey: phase.key, release, sleep: "MEDIUM" as const }))
      : [{ phaseKey: phase.key, release: "SHORT_WAVE" as const, sleep: "MEDIUM" as const }],
  );
}

function refineCandidates(
  build: JevQuestionBuild,
  candidate: SearchCandidate,
): SearchCandidate[] {
  const sleeps = Object.keys(SLEEP_OPTIONS) as SleepOption[];
  const emergencies: readonly (0 | 1 | undefined)[] =
    build.facts.emergencies.length > 0 ? [0, 1] : [undefined];
  return sleeps.flatMap((sleep) =>
    emergencies.map((emergency) => ({
      ...candidate,
      sleep,
      ...(emergency === undefined ? {} : { emergency }),
    })),
  );
}

export function candidateAnswers(
  build: JevQuestionBuild,
  candidate: SearchCandidate,
): Record<string, JevAnswer> {
  const order = [
    candidate.phaseKey,
    ...balancedOrder(build.facts)
      .map((phase) => phase.key)
      .filter((key) => key !== candidate.phaseKey),
  ];
  const answers: Record<string, JevAnswer> = {
    ...balancedAnswers(build),
    [PHASE_KEY]: rankedChoice(order),
    [SLEEP_KEY]: certain(candidate.sleep),
  };
  if (build.facts.askRelease) {
    answers[RELEASE_KEY] = certain(candidate.release);
  }
  if (candidate.emergency !== undefined) {
    answers[EMERGENCY_CLEAR_KEY] = { type: "noul", noul: candidate.emergency };
  }
  return answers;
}

async function rollout(
  context: SearchContext,
  root: RootState,
  candidate: SearchCandidate | undefined,
  ticks: number,
): Promise<number> {
  const engine = context.createEngine();
  engine.restoreCheckpoint(structuredClone(root.engine));
  const memory = new WorkingMemoryStack(context.memoryDepth);
  memory.restore(structuredClone(root.memory));
  let first = true;
  const runner = context.createRunner(engine, memory, (build) => {
    if (first && candidate !== undefined) {
      first = false;
      return candidateAnswers(build, candidate);
    }
    first = false;
    return balancedAnswers(build);
  });
  runner.restoreRunnerState(structuredClone(root.runner));

  const startTick = engine.currentTick;
  const limit =
    context.endTick === undefined
      ? startTick + ticks
      : Math.min(startTick + ticks, context.endTick);
  let value = 0;
  let firstCycle = true;
  while (engine.currentTick < limit) {
    if (!firstCycle) {
      applyDemand(context, engine);
    }
    firstCycle = false;
    const result = await runner.runCycle({ financialBalance: 0, lastSettlement: null });
    value -= engine.consumeTowCharges();
    value -= engine.consumeSecondaryAdmitCount() * context.economy.secondaryAdmitPenalty;
    value -= engine.consumeSchoolBusAccidents() * context.economy.schoolBusAccidentPenalty;
    value += result.metrics.financialDelta;
    const steps = Math.min(result.commit.sleepTicks, limit - engine.currentTick);
    for (let step = 0; step < steps; step += 1) {
      const advanced = advanceTick(context, engine);
      value += advanced.delta;
      if (advanced.interrupted) {
        break;
      }
    }
  }
  const terminal = engine.terminalSettlement(
    (vehicle) => context.economy.toll(vehicle.type),
    context.economy.unservedVehicleLiability,
  );
  return value + terminal.outboundToll + terminal.crossingToll - terminal.unservedLiability;
}

function applyDemand(context: SearchContext, engine: SimulationEngine): void {
  engine.drainUpstreamQueues();
  for (const arrival of arrivalsAt(
    context.seed,
    engine.currentTick,
    defaultRouteIds(engine.network),
  )) {
    engine.spawnScheduled(arrival);
  }
  if (context.pedestrianDemandEnabled) {
    engine.generatePedestrianDemand();
  }
  engine.drainPedestrianEvents();
}

function advanceTick(
  context: SearchContext,
  engine: SimulationEngine,
): { readonly delta: number; readonly interrupted: boolean } {
  const rates = context.economy;
  applyDemand(context, engine);
  const waiting = engine.collectWaitingSettlement(
    rates.delayBleedPerTick,
    rates.upstreamBleedPerTick,
  ).totals;
  let delta = -(waiting.delay + waiting.emergency + waiting.stallChain + waiting.upstream);
  const stepped = engine.step();
  const pedestrians = engine.collectPedestrianSettlement(rates.pedestrianRates);
  delta +=
    pedestrians.completionRevenue -
    pedestrians.delayCost -
    pedestrians.jaywalkCost -
    pedestrians.collisionCost;
  delta -=
    (engine.hazardResourceUnits() + engine.exitLockedResourceCount()) *
    rates.hazardBleedPerResource;
  for (const event of stepped.despawnEvents) {
    delta += violationForfeitsToll(event.violation) ? 0 : rates.toll(event.vehicleType);
  }
  engine.drainIncidentLog();
  engine.drainPedestrianEvents();
  return { delta, interrupted: stepped.interruptReason !== undefined };
}
