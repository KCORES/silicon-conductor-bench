import { afterEach, describe, expect, it, vi } from "vitest";
import { laneBatchesFor, selectVerifiedPhase } from "../src/agent/jev/compile.js";
import type { PhaseCandidate } from "../src/agent/jev/questions.js";
import { CapturingAgentApiLogger } from "../src/agent/api-logger.js";
import { WorkingMemoryStack } from "../src/agent/working-memory.js";
import { SimulationEngine } from "../src/core/engine.js";
import { createRoadNetwork } from "../src/core/network.js";

const phase = (key: string): PhaseCandidate => ({
  key, kind: key === "HOLD" ? "HOLD" : "VEHICLE",
  lanes: key === "HOLD" ? [] : [{ laneId: "IN_N_L1_LEFT", routeId: "N_L1_LEFT", approach: "NORTH", maneuver: "LEFT", waitingTicks: 20, queuedVehicles: 3 }],
  pedestrianPhases: [], queuedVehicles: 3, maxWaitTicks: 20, emergencyVehicles: 0, waitingPedestrians: 0, description: key,
});

describe("Jev unused horizon retry", () => {
  it("uses the otherwise idle second probe for Top-1, preserving walks, speed and the input phase", () => {
    const first = { ...phase("A"), lanes: phase("A").lanes.map(lane => ({ ...lane, speedProfile: "BURST" as const })),
      pedestrianPhases: [{ crosswalk_id: "CROSSWALK:EAST", directions: ["A_TO_B" as const] }] };
    const calls: PhaseCandidate[] = [];
    const selected = selectVerifiedPhase([first, phase("HOLD"), phase("B")], p => {
      calls.push(p);
      return calls.length === 1 ? { ok: false, horizonExceeded: true } : { ok: true };
    }, { horizonShrinkTopN: 3 });
    expect(calls).toHaveLength(2);
    expect(laneBatchesFor(selected.phase, 3)).toEqual([{ lane_id: "IN_N_L1_LEFT", top_n: 1, speed_profile: "BURST" }]);
    expect(selected.phase?.pedestrianPhases).toEqual(first.pedestrianPhases);
    expect(laneBatchesFor(first, 3)[0]?.top_n).toBe(3);
    expect(selected.rejectedKeys).toEqual(["A"]);
  });

  it("does not replace an original second candidate even when that candidate fails", () => {
    const calls: string[] = [];
    selectVerifiedPhase([phase("A"), phase("B"), phase("HOLD")], p => {
      calls.push(p.key); return { ok: false, horizonExceeded: true };
    }, { horizonShrinkTopN: 3 });
    expect(calls).toEqual(["A", "B"]);
  });

  it("preserves the existing crosswalk repair ahead of the new repair", () => {
    const first = { ...phase("A"), pedestrianPhases: [{ crosswalk_id: "CROSSWALK:EAST", directions: ["A_TO_B" as const] }] };
    const calls: string[] = [];
    selectVerifiedPhase([first, phase("HOLD")], p => {
      calls.push(p.key); return { ok: false, conflictCrosswalkId: "CROSSWALK:EAST", horizonExceeded: true };
    }, { horizonShrinkTopN: 3 });
    expect(calls).toEqual(["A", "A-EAST"]);
  });

  it.each(["disabled", "head-only", "other-failure", "hold-first", "first-success"])("does not add a probe for %s", mode => {
    const probe = vi.fn(() => ({ ok: mode === "first-success", horizonExceeded: mode !== "other-failure" }));
    selectVerifiedPhase(mode === "hold-first" ? [phase("HOLD"), phase("A")] : [phase("A"), phase("HOLD")], probe,
      mode === "disabled" ? {} : { horizonShrinkTopN: mode === "head-only" ? 1 : 3 });
    expect(probe).toHaveBeenCalledTimes(mode === "hold-first" ? 0 : 1);
  });

  it("holds after the reduced plan fails without a third probe", () => {
    const probe = vi.fn(() => ({ ok: false, horizonExceeded: true }));
    const selection = selectVerifiedPhase([phase("A"), phase("HOLD")], probe, { horizonShrinkTopN: 6 });
    expect(probe).toHaveBeenCalledTimes(2);
    expect(selection.phase).toBeUndefined();
  });
});

// Synthetic reservation fixture: a long vehicle wave must wait 40 ticks for an
// existing reservation. The head fits the engine's 48-tick horizon; Top-3 does not.
function horizonEngine() {
  const engine = new SimulationEngine({ network: createRoadNetwork(), dynamics: { stallModulus: 1_000_000, creepAfterWaitingTicks: 1_000 } });
  for (let n = 0; n < 3; n++) {
    engine.spawnVehicle("N_L1_LEFT", "simplepoly-city:Bus");
    for (let t = 0; t < 6; t++) engine.step();
  }
  for (let t = 0; t < 30; t++) engine.step();
  const checkpoint = engine.exportCheckpoint();
  const resourceId = engine.network.trajectories.get("N_L1_LEFT")!.slots[0]!.conflictResourceIds[0]!;
  engine.restoreCheckpoint({ ...checkpoint, reservationTable: Array.from({ length: 40 }, (_, i) => ({
    tick: engine.currentTick + i, resources: [{ resourceId, actorId: "existing-plan" }],
  })) });
  return engine;
}

describe("Jev horizon retry through real tools", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  it.each(["on", "off", "tool-limit", "jaywalker"])("preserves quota and exact verification with %s", async mode => {
    vi.stubEnv("JEV_ADAPT_HORIZON_SHRINK", mode === "off" ? "off" : "on");
    vi.stubEnv("JEV_ADAPT_FEEDBACK", "off");
    vi.stubEnv("JEV_ADAPT_CONDITIONAL", "off");
    vi.resetModules();
    const { JevAgentRunner } = await import("../src/agent/jev/runner.js");
    const engine = horizonEngine();
    if (mode === "jaywalker") {
      const pedestrian = engine.spawnScheduledPedestrian({ id: "jaywalker", tick: engine.currentTick, slot: 0, crosswalkId: "CROSSWALK:EAST", direction: "A_TO_B" })!;
      pedestrian.state = "CROSSING_JAYWALK";
    }
    const logger = new CapturingAgentApiLogger();
    const evaluate = vi.fn(async () => ({ model: "jev-test", answers: {
      phase: { type: "choice" as const, choice: "NS_LEFT", confidence: 1, probabilities: { NS_LEFT: 0.9, HOLD: 0.1 } },
      release_size: { type: "choice" as const, choice: "SHORT_WAVE", confidence: 1 },
    } }));
    const result = await new JevAgentRunner({ engine, memory: new WorkingMemoryStack(), client: { evaluate },
      model: "jev-test", economy: { decisionTax: 0.02, toolTax: 0.0015, recklessAttemptPenalty: 1, parallelTerminalWarningPenalty: 1 },
      tollMotorcycle: 0.2, tollStandard: 0.1, tollEmergency: 1, logger, maxApiRounds: 1, maxToolCalls: mode === "tool-limit" ? 1 : 2,
    }).runCycle({ financialBalance: 1000 });
    expect(evaluate).toHaveBeenCalledOnce();
    const calls = logger.records.filter(r => r.event === "TOOL_CALL").map(r => r.payload as { toolName: string; arguments: { lane_batches: unknown } });
    const dry = calls.filter(c => c.toolName === "dry_run_admit");
    expect(dry).toHaveLength(mode === "off" || mode === "tool-limit" ? 1 : 2);
    expect(result.metrics.nonTerminalToolCalls).toBe(dry.length);
    expect(result.metrics.toolTaxCharged).toBeCloseTo(dry.length * 0.0015);
    expect(result.usedFallback).toBe(false);
    const outputs = logger.records.filter(r => r.event === "TOOL_RESULT").map(r => r.payload as { toolName: string; output: Record<string, unknown> });
    expect(outputs[0]?.output).toMatchObject({ error: { code: "TOOL_EXECUTION_ERROR", message: expect.stringContaining("Admission planning horizon exceeded") } });
    if (mode === "on") {
      expect(result.commit.admission.admittedVehicleIds).toHaveLength(1);
      expect(result.metrics.verifiedCommits).toBe(1);
      expect(calls.at(-1)?.arguments.lane_batches).toEqual(dry[1]?.arguments.lane_batches);
      expect(dry[1]?.arguments.lane_batches).toEqual([{ lane_id: "IN_N_L1_LEFT", top_n: 1, speed_profile: "CRUISE" }]);
    } else {
      expect(result.commit.admission.admittedVehicleIds).toHaveLength(0);
      if (mode === "jaywalker") expect(outputs[1]?.output).toHaveProperty("jaywalker_warnings");
    }
  });
});
