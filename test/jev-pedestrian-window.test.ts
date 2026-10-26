import { afterEach, describe, expect, it, vi } from "vitest";
import { CapturingAgentApiLogger } from "../src/agent/api-logger.js";
import { WorkingMemoryStack } from "../src/agent/working-memory.js";
import { SimulationEngine } from "../src/core/engine.js";
import { createRoadNetwork } from "../src/core/network.js";
import { pedestrianWindowRisks } from "../src/agent/jev/pedestrian-window.js";
import { selectVerifiedPhase, laneBatchesFor } from "../src/agent/jev/compile.js";
import type { PhaseCandidate } from "../src/agent/jev/questions.js";

describe("Jev public pedestrian window guard", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  it.each(["safe", "tailgate", "tailgate-disabled"])("retries a short prefix and checks its final risk: %s", async mode => {
    vi.stubEnv("JEV_ADAPT_PEDESTRIAN_WINDOW", "on");
    vi.stubEnv("JEV_ADAPT_HORIZON_SHRINK", "on");
    vi.stubEnv("JEV_ADAPT_FEEDBACK", "off");
    vi.stubEnv("JEV_ADAPT_CONDITIONAL", "off");
    vi.stubEnv("JEV_ADAPT_REPAIR_TAILGATE", mode === "tailgate-disabled" ? "off" : "on");
    vi.resetModules();
    const { JevAgentRunner } = await import("../src/agent/jev/runner.js");
    const engine = new SimulationEngine({ network: createRoadNetwork(), dynamics: { vehicleAggression: true, creepAfterWaitingTicks: 1_000, stallModulus: 1_000_000 } });
    for (let n = 0; n < 3; n++) { engine.spawnVehicle("N_S1_STRAIGHT", "SEDAN"); for (let t = 0; t < 6; t++) engine.step(); }
    for (let t = 0; t < 30; t++) engine.step();
    if (mode.startsWith("tailgate")) {
      const follower = engine.vehicles.get("V00002")!;
      follower.driverWaitTicks = follower.driverPatienceLimit;
    }
    const pedestrian = engine.spawnScheduledPedestrian({ id: "waiting", tick: engine.currentTick, slot: 0, crosswalkId: "CROSSWALK:SOUTH", direction: "A_TO_B" })!;
    pedestrian.state = "WAITING";
    pedestrian.waitingTicks = pedestrian.patienceLimit - 19;
    const logger = new CapturingAgentApiLogger();
    const evaluate = vi.fn(async () => ({ model: "jev-test", answers: {
      phase: { type: "choice" as const, choice: "NS_STRAIGHT", confidence: 1, probabilities: { NS_STRAIGHT: 0.9, HOLD: 0.1 } },
      release_size: { type: "choice" as const, choice: "SHORT_WAVE", confidence: 1 },
    } }));
    const result = await new JevAgentRunner({ engine, client: { evaluate }, memory: new WorkingMemoryStack(), logger, model: "jev-test",
      maxApiRounds: 1, maxToolCalls: 2, tollMotorcycle: 0.2, tollStandard: 0.1, tollEmergency: 1,
      economy: { decisionTax: 0.02, toolTax: 0.0015, recklessAttemptPenalty: 1, parallelTerminalWarningPenalty: 1 },
    }).runCycle({ financialBalance: 1000 });
    const dry = logger.records.filter(r => r.event === "TOOL_RESULT").map(r => r.payload as { toolName: string; output: { ok?: boolean } }).filter(r => r.toolName === "dry_run_admit");
    expect(dry[0]?.output.ok).toBe(true);
    expect(dry).toHaveLength(2);
    if (mode.startsWith("tailgate")) expect(dry[1]?.output).toHaveProperty("tailgate_risk");
    expect(result.commit.admission.admittedVehicleIds).toHaveLength(mode === "tailgate" ? 0 : 1);
    expect(result.metrics.verifiedCommits).toBe(mode === "tailgate" ? 0 : 1);
    expect(result.metrics.nonTerminalToolCalls).toBe(2);
    expect(evaluate).toHaveBeenCalledOnce();
  });

  it.each(["deadline", "disabled", "enough-time", "unrelated", "approaching", "alternative"])(
    "checks the future pedestrian window using the paid plan: %s", async mode => {
      vi.stubEnv("JEV_ADAPT_PEDESTRIAN_WINDOW", mode === "disabled" ? "off" : "on");
      vi.stubEnv("JEV_ADAPT_FEEDBACK", "off");
      vi.stubEnv("JEV_ADAPT_CONDITIONAL", "off");
      vi.stubEnv("JEV_ADAPT_HORIZON_SHRINK", "on");
      vi.resetModules();
      const { JevAgentRunner } = await import("../src/agent/jev/runner.js");
      const engine = new SimulationEngine({ network: createRoadNetwork() });
      engine.spawnVehicle("N_S1_STRAIGHT", "SEDAN");
      if (mode === "alternative") engine.spawnVehicle("E_S1_STRAIGHT", "SEDAN");
      for (let t = 0; t < 30; t++) engine.step();
      const pedestrian = engine.spawnScheduledPedestrian({ id: "waiting", tick: engine.currentTick, slot: 0,
        crosswalkId: mode === "unrelated" ? "CROSSWALK:EAST" : "CROSSWALK:SOUTH", direction: "A_TO_B" })!;
      if (mode !== "approaching") pedestrian.state = "WAITING";
      pedestrian.waitingTicks = mode === "enough-time" ? 0 : pedestrian.patienceLimit - 2;
      const logger = new CapturingAgentApiLogger();
      const evaluate = vi.fn(async () => ({ model: "jev-test", answers: {
        phase: { type: "choice" as const, choice: "NS_STRAIGHT", confidence: 1,
          probabilities: mode === "alternative" ? { NS_STRAIGHT: 0.6, EW_STRAIGHT: 0.3, HOLD: 0.1 } : { NS_STRAIGHT: 0.9, HOLD: 0.1 } },
        release_size: { type: "choice" as const, choice: "HEAD_ONLY", confidence: 1 },
      } }));
      const result = await new JevAgentRunner({ client: { evaluate }, engine, memory: new WorkingMemoryStack(), logger,
        model: "jev-test", maxApiRounds: 1, maxToolCalls: 2, tollMotorcycle: 0.2, tollStandard: 0.1, tollEmergency: 1,
        economy: { decisionTax: 0.02, toolTax: 0.0015, recklessAttemptPenalty: 1, parallelTerminalWarningPenalty: 1 },
      }).runCycle({ financialBalance: 1000 });
      const outputs = logger.records.filter(r => r.event === "TOOL_RESULT")
        .map(r => r.payload as { toolName: string; output: Record<string, unknown> });
      const dry = outputs.filter(r => r.toolName === "dry_run_admit");
      expect(dry[0]?.output.ok).toBe(true);
      expect(dry[0]?.output).not.toHaveProperty("jaywalker_warnings");
      expect(evaluate).toHaveBeenCalledOnce();
      expect(result.metrics.toolCallsByName.dry_run_admit).toBe(mode === "alternative" ? 2 : 1);
      expect(result.metrics.nonTerminalToolCalls).toBe(mode === "alternative" ? 2 : 1);
      expect(result.usedFallback).toBe(false);
      if (mode === "deadline") {
        expect(result.commit.admission.admittedVehicleIds).toHaveLength(0);
        expect(result.trace).toContainEqual(expect.objectContaining({ kind: "PROTOCOL_WARNING", data: expect.objectContaining({ reason: "PEDESTRIAN_WINDOW_RISK" }) }));
      } else {
        expect(result.commit.admission.admittedVehicleIds).toHaveLength(1);
        expect(result.metrics.verifiedCommits).toBe(1);
        if (mode === "alternative") expect(result.commit.tacticalSummary).toContain("phase=EW_STRAIGHT");
      }
    },
  );
});

describe("public patience deadline boundaries", () => {
  const observation = { currentTick: 100, crosswalks: [{ crosswalkId: "CROSSWALK:NORTH", directions: [
    { direction: "A_TO_B" as const, approaching: 0, waiting: 1, crossing: 0, jaywalking: 0, minPatienceRemaining: 20, clearTick: null },
    { direction: "B_TO_A" as const, approaching: 0, waiting: 2, crossing: 0, jaywalking: 0, minPatienceRemaining: 10, clearTick: null },
  ] }] };
  it("checks the earliest waiting side and the latest follower, including equality", () => {
    expect(pedestrianWindowRisks(observation, ["CROSSWALK:NORTH"], [["head", "C", 100, 109, 0], ["follower", "C", 104, 110, 1]]))
      .toEqual([{ crosswalkId: "CROSSWALK:NORTH", patienceDeadline: 110, plannedClearTick: 110 }]);
    expect(pedestrianWindowRisks(observation, ["CROSSWALK:NORTH"], [["head", "C", 100, 109, 0]])).toEqual([]);
  });
  it("does not invent a deadline for absent or non-waiting pedestrians", () => {
    expect(pedestrianWindowRisks({ currentTick: 100 }, ["CROSSWALK:NORTH"], [["v", "C", 100, 130, 0]])).toEqual([]);
    const empty = { ...observation, crosswalks: observation.crosswalks.map(c => ({ ...c, directions: c.directions.map(d => ({ ...d, waiting: 0 })) })) };
    expect(pedestrianWindowRisks(empty, ["CROSSWALK:NORTH"], [["v", "C", 100, 130, 0]])).toEqual([]);
  });
  it("leaves pedestrian-only plans unaffected", () => {
    expect(pedestrianWindowRisks(observation, [], [])).toEqual([]);
  });
  it("repairs only the identified safe lanes and never tries a third plan", () => {
    const phase: PhaseCandidate = { key: "MIXED", kind: "VEHICLE", lanes: ["N", "E"].map(direction => ({
      laneId: `IN_${direction}_S1_STRAIGHT`, routeId: `${direction}_S1_STRAIGHT`, approach: direction === "N" ? "NORTH" : "EAST",
      maneuver: "STRAIGHT", waitingTicks: 1, queuedVehicles: 3,
    })), pedestrianPhases: [], queuedVehicles: 6, maxWaitTicks: 1, emergencyVehicles: 0, waitingPedestrians: 0, description: "mixed" };
    const seen: PhaseCandidate[] = [];
    const result = selectVerifiedPhase([phase, { ...phase, key: "SECOND" }, { ...phase, key: "HOLD", kind: "HOLD", lanes: [] }], candidate => {
      seen.push(candidate);
      return { ok: false, windowRepairLaneIds: ["IN_E_S1_STRAIGHT"] };
    });
    expect(seen).toHaveLength(2);
    expect(laneBatchesFor(seen[1], 3)).toEqual([{ lane_id: "IN_E_S1_STRAIGHT", top_n: 1, speed_profile: "CRUISE" }]);
    expect(result.phase).toBeUndefined();
  });
});
