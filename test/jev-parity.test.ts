import { afterEach, describe, expect, it, vi } from "vitest";
import { JevAgentRunner } from "../src/agent/jev/runner.js";
import { CapturingAgentApiLogger } from "../src/agent/api-logger.js";
import { compactObservationForModel } from "../src/agent/model-observation.js";
import { buildTrafficSystemPrompt } from "../src/agent/runner.js";
import { selectAgentTools } from "../src/agent/tools.js";
import { config } from "../src/config.js";
import { SimulationEngine } from "../src/core/engine.js";
import { createRoadNetwork } from "../src/core/network.js";
import { AgentToolRuntime } from "../src/agent/tools.js";
import { AgentMetricsCollector } from "../src/agent/metrics.js";
import { WorkingMemoryStack } from "../src/agent/working-memory.js";
import { buildJevQuestions, type PhaseCandidate } from "../src/agent/jev/questions.js";
import { laneBatchesFor, selectVerifiedPhase } from "../src/agent/jev/compile.js";

vi.hoisted(() => { vi.stubEnv("JEV_ADAPT_FEEDBACK", "on"); });

const economy = { decisionTax: 0.02, toolTax: 0.0015, recklessAttemptPenalty: 1, parallelTerminalWarningPenalty: 1 };
function readyEngine(routes: string[]) {
  const engine = new SimulationEngine({ network: createRoadNetwork() });
  const vehicles = routes.map(route => engine.spawnVehicle(route, "SEDAN")!);
  for (let tick = 0; tick < 160 && engine.buildObservation(1000).stoplineCandidates.length < routes.length; tick++) engine.step();
  return { engine, vehicles };
}

describe("Jev legal actions and shared quotas", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  it("defaults to full public input with experimental extra rounds disabled", async () => {
    vi.stubEnv("JEV_ADAPT", "on");
    vi.stubEnv("JEV_ADAPT_FEEDBACK", undefined);
    vi.stubEnv("JEV_ADAPT_CONDITIONAL", undefined);
    vi.resetModules();
    const flags = await import("../src/agent/jev/questions.js");
    expect(flags.ADAPT_PARITY_INPUT).toBe(true);
    expect(flags.ADAPT_FEEDBACK).toBe(false);
    expect(flags.ADAPT_CONDITIONAL).toBe(false);
  });

  it.each([1, 2])("never exceeds %i paid tools or two dry-runs when every selected phase is unsafe", async maxToolCalls => {
    const { engine } = readyEngine(["N_S1_STRAIGHT"]);
    const pedestrian = engine.spawnScheduledPedestrian({ id: "jaywalker", tick: engine.currentTick, slot: 0, crosswalkId: "CROSSWALK:SOUTH", direction: "A_TO_B" })!;
    pedestrian.state = "CROSSING_JAYWALK";
    const logger = new CapturingAgentApiLogger();
    const runner = new JevAgentRunner({ engine, memory: new WorkingMemoryStack(), economy,
      maxApiRounds: 2, maxToolCalls, model: "jev-test", tollMotorcycle: 0.2, tollStandard: 0.1, tollEmergency: 1, logger,
      client: { async evaluate() { return { model: "jev-test", answers: { phase: { type: "choice", choice: "NS_STRAIGHT", confidence: 1 } } }; } },
    });
    const result = await runner.runCycle({ financialBalance: 1000 });
    expect(result.metrics.apiCalls).toBe(maxToolCalls);
    expect(result.metrics.nonTerminalToolCalls).toBe(maxToolCalls);
    expect(result.metrics.toolCallsByName.dry_run_admit).toBe(maxToolCalls);
    expect(result.metrics.toolTaxCharged).toBeCloseTo(economy.toolTax * maxToolCalls);
    expect(result.commit.admission.admittedVehicleIds).toHaveLength(0);
    const reasons = logger.records.filter(row => row.event === "TOOL_RESULT")
      .map(row => (row.payload as { output: { reason?: string } }).output.reason);
    expect(reasons).not.toContain("DRY_RUN_QUOTA_EXHAUSTED");
  });

  it("conditions parameters on the chosen phase and verifies the exact compiled batch", async () => {
    vi.stubEnv("JEV_ADAPT_CONDITIONAL", "on");
    vi.resetModules();
    const { JevAgentRunner: ConditionalRunner } = await import("../src/agent/jev/runner.js");
    const { engine } = readyEngine(["N_S1_STRAIGHT"]);
    const logger = new CapturingAgentApiLogger();
    let calls = 0;
    const runner = new ConditionalRunner({ engine, memory: new WorkingMemoryStack(), economy,
      maxApiRounds: 2, maxToolCalls: 1, model: "jev-test", tollMotorcycle: 0.2, tollStandard: 0.1, tollEmergency: 1, logger,
      client: { async evaluate(request) {
        calls++;
        if (calls === 1) return { model: "jev-test", answers: { phase: { type: "choice", choice: "NS_STRAIGHT", confidence: 1 } } };
        expect(request.state).toMatchObject({ decisionStage: "parameters", selectedPhase: expect.objectContaining({ key: "NS_STRAIGHT" }) });
        expect(request.questions).not.toHaveProperty("phase");
        return { model: "jev-test", answers: {
          "release:IN_N_S1_STRAIGHT": { type: "choice", choice: "N8", confidence: 1 },
          "speed:IN_N_S1_STRAIGHT": { type: "choice", choice: "BURST", confidence: 1 },
          sleep: { type: "choice", choice: "T7", confidence: 1 },
        } };
      } },
    });
    const result = await runner.runCycle({ financialBalance: 1000 });
    expect(calls).toBe(2);
    expect(result.commit.sleepTicks).toBe(7);
    expect(result.metrics.verifiedCommits).toBe(1);
    expect(result.metrics.nonTerminalToolCalls).toBe(1);
    const tools = logger.records.filter(row => row.event === "TOOL_CALL").map(row => row.payload as { arguments: { lane_batches: unknown } });
    expect(tools[0]?.arguments.lane_batches).toEqual([{ lane_id: "IN_N_S1_STRAIGHT", top_n: 8, speed_profile: "BURST" }]);
    expect(tools[1]?.arguments.lane_batches).toEqual(tools[0]?.arguments.lane_batches);
  });

  it("returns a failed real dry-run to Jev and commits the model's corrected plan within two probes", async () => {
    const { engine } = readyEngine(["N_S1_STRAIGHT", "E_S1_STRAIGHT"]);
    const pedestrian = engine.spawnScheduledPedestrian({ id: "jaywalker", tick: engine.currentTick, slot: 0, crosswalkId: "CROSSWALK:SOUTH", direction: "A_TO_B" })!;
    pedestrian.state = "CROSSING_JAYWALK";
    const logger = new CapturingAgentApiLogger();
    const requests: Record<string, unknown>[] = [];
    const runner = new JevAgentRunner({ engine, memory: new WorkingMemoryStack(), economy,
      model: "jev-test", tollMotorcycle: 0.2, tollStandard: 0.1, tollEmergency: 1, logger,
      client: { async evaluate(request) {
        requests.push(request.state as Record<string, unknown>);
        return { model: "jev-test", answers: {
          phase: { type: "choice", choice: requests.length === 1 ? "NS_STRAIGHT" : "EW_STRAIGHT", confidence: 1 },
          release_size: { type: "choice", choice: "HEAD_ONLY", confidence: 1 },
          sleep: { type: "choice", choice: requests.length === 1 ? "LONG" : "SHORT", confidence: 1 },
        } };
      } },
    });
    const result = await runner.runCycle({ financialBalance: 1000 });
    expect(requests).toHaveLength(2);
    expect(requests[1]).toMatchObject({ remainingDryRuns: 1, toolFeedback: expect.arrayContaining([
      expect.objectContaining({ toolName: "dry_run_admit", output: expect.objectContaining({ jaywalker_warnings: expect.any(Array) }) }),
    ]) });
    expect(result.commit.tacticalSummary).toContain("phase=EW_STRAIGHT");
    expect(result.commit.sleepTicks).toBe(2);
    expect(result.metrics.apiCalls).toBe(2);
    expect(result.metrics.decisionTaxCharged).toBeCloseTo(0.04);
    expect(result.metrics.toolCallsByName.dry_run_admit).toBe(2);
    expect(result.metrics.verifiedCommits).toBe(1);
  });

  it("sends the same rules, spatial observation, horizon and tool definitions as the chat agent", async () => {
    const { engine } = readyEngine(["N_S1_STRAIGHT"]);
    const observation = engine.buildObservation(1000);
    const parityEconomy = { ...economy, endTick: 261, horizonTicks: 200 };
    const expectedObservation = compactObservationForModel(observation, 261, { snapshot: engine.spatialSnapshot() });
    let state: Record<string, unknown> = {};
    const runner = new JevAgentRunner({ engine, memory: new WorkingMemoryStack(), economy: parityEconomy,
      model: "jev-test", tollMotorcycle: 0.2, tollStandard: 0.1, tollEmergency: 1, logger: new CapturingAgentApiLogger(),
      client: { async evaluate(request) { state = request.state as Record<string, unknown>; return { model: "jev-test", answers: { phase: { type: "choice", choice: "HOLD", confidence: 1 } } }; } },
    });
    runner.restoreRunnerState({ cycle: 0, recentCycles: [], incidents: [], pendingFeedback: ["previous tool failed"] });
    await runner.runCycle({ financialBalance: 1000 });
    expect(state.rules).toBe(buildTrafficSystemPrompt(config.agent.maxApiRounds, parityEconomy));
    expect(state.observation).toEqual(expectedObservation);
    expect(state.tools).toEqual(selectAgentTools(observation));
    expect(state.lastSettlement).toBeNull();
    expect(state.previous_agent_feedback).toEqual(["previous tool failed"]);
  });

  it("keeps a temporarily reserved route that the real batch planner can schedule", () => {
    const { engine, vehicles } = readyEngine(["N_S1_STRAIGHT", "S_L1_LEFT"]);
    engine.applyAdmissions([vehicles[0]!.id]);
    const observation = engine.buildObservation(1000);
    expect(observation.blockedRoutes).toContainEqual(expect.objectContaining({ routeId: "S_L1_LEFT", blockKind: "RESERVATION" }));
    const dry = engine.dryRunAdmissionPlan([], [{ laneId: "IN_S_L1_LEFT", topN: 1 }]);
    expect(dry.feasible).toBe(true);
    expect(dry.enterPlan?.[0]?.enterTick).toBeGreaterThan(engine.currentTick);
    const built = buildJevQuestions({ observation, network: engine.network });
    expect(built.facts.phases.some(p => p.lanes.some(lane => lane.laneId === "IN_S_L1_LEFT"))).toBe(true);
  });

  it("does not issue a third dry-run when the first two warn about jaywalkers", () => {
    const { engine } = readyEngine(["N_S1_STRAIGHT"]);
    const pedestrian = engine.spawnScheduledPedestrian({ id: "jaywalker", tick: engine.currentTick, slot: 0, crosswalkId: "CROSSWALK:SOUTH", direction: "A_TO_B" })!;
    pedestrian.state = "CROSSING_JAYWALK";
    const metrics = new AgentMetricsCollector(economy);
    const runtime = new AgentToolRuntime({ engine, memory: new WorkingMemoryStack(), metrics, tollMotorcycle: 0.2, tollStandard: 0.1, tollEmergency: 1 });
    const candidate = buildJevQuestions({ observation: engine.buildObservation(1000), network: engine.network }).facts.phases.find(p => p.kind === "VEHICLE")!;
    const outputs: unknown[] = [];
    selectVerifiedPhase([candidate, { ...candidate, key: "B" }, { ...candidate, key: "C" }], phase => {
      const result = runtime.execute("dry_run_admit", JSON.stringify({ lane_batches: laneBatchesFor(phase, 1) }));
      outputs.push(result.output);
      const output = result.output as { ok?: boolean; jaywalker_warnings?: unknown[] };
      return { ok: output.ok === true && !output.jaywalker_warnings?.length };
    });
    expect(outputs).toHaveLength(2);
    expect(outputs.every(output => (output as { ok?: boolean }).ok === true)).toBe(true);
    expect(metrics.snapshot().nonTerminalToolCalls).toBe(2);
  });

  it("keeps the joint batch within the engine's 16-vehicle limit", () => {
    const { engine } = readyEngine(["N_S1_STRAIGHT", "N_S2_STRAIGHT", "S_S1_STRAIGHT", "S_S2_STRAIGHT"]);
    const candidate = buildJevQuestions({ observation: engine.buildObservation(1000), network: engine.network }).facts.phases.find(p => p.key === "NS_STRAIGHT") as PhaseCandidate;
    const batches = laneBatchesFor(candidate, 6);
    expect(batches).toHaveLength(4);
    expect(batches.reduce((sum, batch) => sum + batch.top_n, 0)).toBeLessThanOrEqual(16);
  });
});
