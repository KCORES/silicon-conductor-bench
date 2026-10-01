import OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import {
  detectReasoningFormat,
  resolveProviderRequestProfile,
  type ReasoningEffort,
  type ReasoningFormat,
} from "../src/config.js";
import { SimulationEngine } from "../src/core/engine.js";
import { createRoadNetwork } from "../src/core/network.js";
import type { Pedestrian } from "../src/core/types.js";
import {
  AgentMetricsCollector,
  describeTokenUsage,
} from "../src/agent/metrics.js";
import {
  CapturingAgentApiLogger,
  FileAgentApiLogger,
  SilentAgentApiLogger,
} from "../src/agent/api-logger.js";
import {
  buildTrafficSystemPrompt,
  ToolCallAgentRunner,
} from "../src/agent/runner.js";
import { compactObservationForModel } from "../src/agent/model-observation.js";
import {
  buildAgentSettlementSummary,
  type AgentSettlementSummary,
} from "../src/agent/settlement.js";
import {
  AGENT_TOOLS,
  AgentToolRuntime,
  COMMIT_SCHEDULE,
  DISPATCH_EMERGENCY_CONVOY,
  DISPATCH_TOW_TRUCK,
  DRY_RUN_ADMIT,
  GUIDE_INBOUND_LANE_CHANGE,
  INSPECT_CROSSWALK,
  INSPECT_LANE_QUEUE,
  REROUTE_QUEUE_AROUND_STALL,
  SET_LANE_DETOUR,
} from "../src/agent/tools.js";
import { WorkingMemoryStack } from "../src/agent/working-memory.js";

const economy = {
  decisionTax: 2,
  toolTax: 0.15,
  recklessAttemptPenalty: 15,
  parallelTerminalWarningPenalty: 0.5,
};

function advanceToStoplines(engine: SimulationEngine): void {
  for (let tick = 0; tick < 30; tick += 1) {
    engine.step();
  }
}

function runtimeFor(engine: SimulationEngine, metrics: AgentMetricsCollector) {
  return new AgentToolRuntime({
    engine,
    metrics,
    memory: new WorkingMemoryStack(),
    tollMotorcycle: 5,
    tollStandard: 20,
    tollEmergency: 50,
  });
}

describe("agent tools", () => {
  it("isolates working-memory stack lifecycle", () => {
    const memory = new WorkingMemoryStack(2);
    const saved = memory.save(
      {
        phaseName: "NORTH_SOUTH_CLEARING",
        intendedDuration: 5,
        resumeCondition: "Emergency cleared",
      },
      100,
    );

    expect(saved.plan?.targetTick).toBe(105);
    expect(memory.peek().plan?.phaseName).toBe("NORTH_SOUTH_CLEARING");
    expect(memory.pop().plan?.savedAtTick).toBe(100);
    expect(memory.depth).toBe(0);
    expect(memory.clear().plan).toBeNull();
  });

  it("dry-runs against live crossing reservations without mutation", () => {
    const engine = new SimulationEngine({ network: createRoadNetwork() });
    for (const routeId of engine.network.trajectories.keys()) {
      engine.spawnVehicle(routeId, "MOTORCYCLE");
    }
    advanceToStoplines(engine);
    const conflict = engine.buildObservation(0).candidateConflicts[0];
    expect(conflict).toBeDefined();
    if (conflict === undefined) {
      return;
    }

    engine.applyAdmissions([conflict.vehicleIdA]);
    const before = engine.getSnapshot();
    const dryRun = engine.dryRunAdmissions([conflict.vehicleIdB]);
    const after = engine.getSnapshot();

    expect(dryRun.feasible).toBe(false);
    expect(dryRun.conflictDetected).toBeDefined();
    expect(after).toEqual(before);
  });

  it("limits lane inspection depth and reports physical occupancy", () => {
    const engine = new SimulationEngine({ network: createRoadNetwork() });
    const routeId = "N_S1_STRAIGHT";
    for (let index = 0; index < 4; index += 1) {
      engine.spawnVehicle(routeId, "MOTORCYCLE");
      for (let tick = 0; tick < 3; tick += 1) {
        engine.step();
      }
    }
    advanceToStoplines(engine);

    const inspection = engine.inspectLaneQueue("IN_N_S1_STRAIGHT", 2);
    expect(inspection.totalQueued).toBeGreaterThanOrEqual(2);
    expect(inspection.vehiclesBehind).toHaveLength(2);
    expect(inspection.capacityOccupancy).toBeGreaterThan(0);
  });

  it("classifies verified and reckless commits with configured economics", () => {
    const safeEngine = new SimulationEngine({ network: createRoadNetwork() });
    const safeVehicle = safeEngine.spawnVehicle(
      "N_S1_STRAIGHT",
      "MOTORCYCLE",
    );
    advanceToStoplines(safeEngine);
    const safeMetrics = new AgentMetricsCollector(economy);
    const safeRuntime = runtimeFor(safeEngine, safeMetrics);
    safeRuntime.execute(
      DRY_RUN_ADMIT,
      JSON.stringify({ candidate_vehicle_ids: [safeVehicle?.id] }),
    );
    safeRuntime.execute(
      COMMIT_SCHEDULE,
      JSON.stringify({
        admit_vehicle_ids: [safeVehicle?.id],
        sleep_ticks: 2,
        tactical_summary: "Verified",
      }),
    );
    expect(safeMetrics.snapshot().verifiedCommits).toBe(1);
    expect(safeMetrics.snapshot().toolTaxCharged).toBe(0.15);

    const unverifiedEngine = new SimulationEngine({
      network: createRoadNetwork(),
    });
    const unverifiedVehicle = unverifiedEngine.spawnVehicle(
      "S_S1_STRAIGHT",
      "MOTORCYCLE",
    );
    advanceToStoplines(unverifiedEngine);
    const unverifiedMetrics = new AgentMetricsCollector(economy);
    runtimeFor(unverifiedEngine, unverifiedMetrics).execute(
      COMMIT_SCHEDULE,
      JSON.stringify({
        admit_vehicle_ids: [unverifiedVehicle?.id],
        sleep_ticks: 1,
        tactical_summary: "Safe but not probed",
      }),
    );
    expect(unverifiedMetrics.snapshot().unverifiedCommits).toBe(1);

    const riskyEngine = new SimulationEngine({ network: createRoadNetwork() });
    for (const routeId of riskyEngine.network.trajectories.keys()) {
      riskyEngine.spawnVehicle(routeId, "MOTORCYCLE");
    }
    advanceToStoplines(riskyEngine);
    const pair = riskyEngine.buildObservation(0).candidateConflicts[0];
    expect(pair).toBeDefined();
    if (pair === undefined) {
      return;
    }
    const riskyMetrics = new AgentMetricsCollector(economy);
    const riskyRuntime = runtimeFor(riskyEngine, riskyMetrics);
    expect(
      riskyRuntime.execute(
        DRY_RUN_ADMIT,
        JSON.stringify({
          candidate_vehicle_ids: [pair.vehicleIdA, pair.vehicleIdB],
        }),
      ).output,
    ).toMatchObject({ ok: false });
    riskyRuntime.execute(
      COMMIT_SCHEDULE,
      JSON.stringify({
        admit_vehicle_ids: [pair.vehicleIdA, pair.vehicleIdB],
        sleep_ticks: 1,
        tactical_summary: "Blind commit",
      }),
    );
    expect(riskyMetrics.snapshot().recklessAttempts).toBe(0);
    expect(riskyMetrics.snapshot().unverifiedCommits).toBe(1);
    expect(riskyMetrics.snapshot().penaltiesCharged).toBe(0);
    expect(riskyEngine.scheduledCollisionCount).toBe(1);
  });

  it("counts an empty commit as a hold instead of an unverified commit", () => {
    const engine = new SimulationEngine({ network: createRoadNetwork() });
    const metrics = new AgentMetricsCollector(economy);
    runtimeFor(engine, metrics).execute(
      COMMIT_SCHEDULE,
      JSON.stringify({
        admit_vehicle_ids: [],
        sleep_ticks: 1,
        tactical_summary: "Hold for one tick",
      }),
    );

    expect(metrics.snapshot()).toMatchObject({
      holdCommits: 1,
      verifiedCommits: 0,
      unverifiedCommits: 0,
      recklessAttempts: 0,
    });
  });

  it("matches a verified plan regardless of vehicle order", () => {
    const engine = new SimulationEngine({
      network: createRoadNetwork(),
      dynamics: { stallModulus: 1_000_000 },
    });
    const east = engine.spawnVehicle("E_S1_STRAIGHT", "MOTORCYCLE");
    const west = engine.spawnVehicle("W_S1_STRAIGHT", "MOTORCYCLE");
    advanceToStoplines(engine);
    const ids = [east?.id ?? "missing-east", west?.id ?? "missing-west"];
    const metrics = new AgentMetricsCollector(economy);
    const runtime = runtimeFor(engine, metrics);

    expect(
      runtime.execute(
        DRY_RUN_ADMIT,
        JSON.stringify({ candidate_vehicle_ids: ids }),
      ).output,
    ).toMatchObject({ ok: true });
    runtime.execute(
      COMMIT_SCHEDULE,
      JSON.stringify({
        admit_vehicle_ids: [...ids].reverse(),
        sleep_ticks: 1,
        tactical_summary: "Same safe set, reversed",
      }),
    );

    expect(metrics.snapshot()).toMatchObject({
      verifiedCommits: 1,
      unverifiedCommits: 0,
    });
  });

  it("describes the boundary between accident detours and stall bypasses", () => {
    const detour = AGENT_TOOLS.find(
      (tool) =>
        tool.type === "function" && tool.function.name === SET_LANE_DETOUR,
    );
    const bypass = AGENT_TOOLS.find(
      (tool) =>
        tool.type === "function" &&
        tool.function.name === REROUTE_QUEUE_AROUND_STALL,
    );
    const convoy = AGENT_TOOLS.find(
      (tool) =>
        tool.type === "function" &&
        tool.function.name === DISPATCH_EMERGENCY_CONVOY,
    );
    const tow = AGENT_TOOLS.find(
      (tool) =>
        tool.type === "function" &&
        tool.function.name === DISPATCH_TOW_TRUCK,
    );
    const detourDescription =
      detour?.type === "function" ? detour.function.description : undefined;
    const bypassDescription =
      bypass?.type === "function" ? bypass.function.description : undefined;
    const convoyDescription =
      convoy?.type === "function" ? convoy.function.description : undefined;
    const towDescription =
      tow?.type === "function" ? tow.function.description : undefined;

    expect(detourDescription).toContain("SOURCE_NOT_SEVERED");
    expect(detourDescription).toContain("抛锚");
    expect(detourDescription).toContain("保持原去向");
    expect(detourDescription).toContain("MANEUVER_NOT_SUPPORTED");
    expect(detourDescription).toContain("valid_target_route_ids");
    expect(convoyDescription).toContain("实体滑到");
    expect(towDescription).toContain("completion_tick");
    expect(bypassDescription).toContain(
      "stalledVehicles.bypassAvailability",
    );
    expect(buildTrafficSystemPrompt(6)).toContain("最多可挪车数");
    expect(buildTrafficSystemPrompt(6)).toContain("禁止只改 route");
    expect(buildTrafficSystemPrompt(6)).toContain("blocking_vehicle_id");
    expect(buildTrafficSystemPrompt(6)).toContain(
      "STOPLINE_HEADS_SAME_TICK",
    );
    expect(buildTrafficSystemPrompt(6)).toContain("完全相同参数");
    expect(buildTrafficSystemPrompt(6)).toContain("incidentBlocked");
    expect(buildTrafficSystemPrompt(6)).toContain("不是保证解锁时刻");
    expect(buildTrafficSystemPrompt(6)).toContain("40–60");
    expect(buildTrafficSystemPrompt(6)).toContain("上游 4 格");
    expect(buildTrafficSystemPrompt(6)).toContain("每 4 tick");
    expect(buildTrafficSystemPrompt(6)).toContain("inspect_crosswalk");
    expect(buildTrafficSystemPrompt(6)).toContain("laneGuidanceOpportunities");
    expect(buildTrafficSystemPrompt(6)).toContain("SLOW_SLIDE");
    expect(buildTrafficSystemPrompt(6)).toContain("0、1");
    expect(buildTrafficSystemPrompt(6)).toContain("swept");
    expect(buildTrafficSystemPrompt(6)).toContain("默认");
    expect(
      AGENT_TOOLS.some(
        (tool) =>
          tool.type === "function" &&
          tool.function.name === GUIDE_INBOUND_LANE_CHANGE,
      ),
    ).toBe(true);
  });

  it("executes an atomic lane guidance tool call", () => {
    const engine = new SimulationEngine({ network: createRoadNetwork() });
    const vehicle = engine.spawnVehicle("N_L1_LEFT", "MOTORCYCLE");
    const metrics = new AgentMetricsCollector(economy);

    const result = runtimeFor(engine, metrics).execute(
      GUIDE_INBOUND_LANE_CHANGE,
      JSON.stringify({
        vehicle_id: vehicle?.id,
        target_lane: "IN_N_S2_STRAIGHT",
      }),
    );

    expect(result).toMatchObject({
      terminal: false,
      output: {
        ok: true,
        vehicle_id: vehicle?.id,
        guided_route: "N_S2_GUIDED_LEFT",
      },
    });
    expect(metrics.snapshot().toolCallsByName).toMatchObject({
      [GUIDE_INBOUND_LANE_CHANGE]: 1,
    });
  });

  it("warns when a released vehicle crosses a crosswalk with a jaywalker", () => {
    const engine = new SimulationEngine({ network: createRoadNetwork() });
    const vehicle = engine.spawnVehicle("N_S1_STRAIGHT", "MOTORCYCLE");
    advanceToStoplines(engine);
    const pedestrian = engine.spawnScheduledPedestrian({
      id: "jaywalker",
      tick: engine.currentTick,
      slot: 0,
      crosswalkId: "CROSSWALK:SOUTH",
      direction: "A_TO_B",
    });
    if (vehicle === undefined || pedestrian === undefined) {
      throw new Error("missing actors");
    }
    pedestrian.state = "CROSSING_JAYWALK";
    const runtime = runtimeFor(engine, new AgentMetricsCollector(economy));
    const warning = {
      vehicle_id: vehicle.id,
      crosswalk_id: "CROSSWALK:SOUTH",
      pedestrian_ids: ["jaywalker"],
    };

    const dryRun = runtime.execute(
      DRY_RUN_ADMIT,
      JSON.stringify({ candidate_vehicle_ids: [vehicle.id] }),
    );
    const commit = runtime.execute(
      COMMIT_SCHEDULE,
      JSON.stringify({
        admit_vehicle_ids: [vehicle.id],
        sleep_ticks: 1,
        tactical_summary: "release",
      }),
    );

    expect(dryRun.output).toMatchObject({
      ok: true,
      jaywalker_warnings: [warning],
    });
    expect(commit.output).toMatchObject({ jaywalker_warnings: [warning] });
  });

  it("truncates long tactical summaries instead of rejecting the commit", () => {
    const engine = new SimulationEngine({ network: createRoadNetwork() });
    const vehicle = engine.spawnVehicle("N_S1_STRAIGHT", "MOTORCYCLE");
    advanceToStoplines(engine);
    const metrics = new AgentMetricsCollector(economy);
    const result = runtimeFor(engine, metrics).execute(
      COMMIT_SCHEDULE,
      JSON.stringify({
        admit_vehicle_ids: [vehicle?.id],
        sleep_ticks: 1,
        tactical_summary: "A".repeat(360),
      }),
    );

    expect(result.terminal).toBe(true);
    expect(result.commit?.tacticalSummary).toHaveLength(300);
    expect(metrics.snapshot().warnings).toContain("warning_summary_truncated");
    expect(metrics.snapshot().unverifiedCommits).toBe(1);
  });

  it("returns compact dry-run and inspect payloads", () => {
    const engine = new SimulationEngine({ network: createRoadNetwork() });
    for (const routeId of engine.network.trajectories.keys()) {
      engine.spawnVehicle(routeId, "MOTORCYCLE");
    }
    advanceToStoplines(engine);
    const conflict = engine.buildObservation(0).candidateConflicts[0];
    expect(conflict).toBeDefined();
    if (conflict === undefined) {
      return;
    }
    const metrics = new AgentMetricsCollector(economy);
    const runtime = runtimeFor(engine, metrics);
    const dryRun = runtime.execute(
      DRY_RUN_ADMIT,
      JSON.stringify({
        candidate_vehicle_ids: [conflict.vehicleIdA, conflict.vehicleIdB],
      }),
    );
    const inspect = runtime.execute(
      INSPECT_LANE_QUEUE,
      JSON.stringify({ lane_id: "IN_N_S1_STRAIGHT", depth: 2 }),
    );

    expect(dryRun.output).toMatchObject({ ok: false });
    expect(JSON.stringify(dryRun.output)).not.toContain("results");
    expect(inspect.output).toMatchObject({ lane: "IN_N_S1_STRAIGHT" });
    expect(JSON.stringify(inspect.output)).not.toContain("vehicles_behind");
  });

  it("keeps crosswalk summaries and only high-risk pedestrian alerts in model data", () => {
    const engine = new SimulationEngine({
      network: createRoadNetwork(),
      seed: 6,
    });
    const pedestrian = engine.spawnScheduledPedestrian({
      id: "model-alert",
      tick: 0,
      slot: 0,
      crosswalkId: "CROSSWALK:WEST",
      direction: "A_TO_B",
    });
    expect(pedestrian).toBeDefined();
    if (pedestrian === undefined) {
      return;
    }
    movePedestrianToWaiting(pedestrian);
    pedestrian.waitingTicks = pedestrian.patienceLimit - 5;

    const compact = compactObservationForModel(engine.buildObservation(0), undefined, {
      snapshot: engine.spatialSnapshot(),
    });
    const crosswalks = compact.crosswalks as Record<string, unknown[]>;
    expect(crosswalks.W?.[0]).toEqual([0, 1, 0, 5, null]);
    expect(crosswalks.W?.[1]).toEqual(["........", "........"]);
    expect(compact.pedestrianAlerts).toEqual([[pedestrian.id, "AB", "P", 5]]);
  });

  it("stops the third dry_run_admit in a cycle before simulation", () => {
    const engine = new SimulationEngine({ network: createRoadNetwork() });
    const vehicle = engine.spawnVehicle("N_S1_STRAIGHT", "MOTORCYCLE");
    advanceToStoplines(engine);
    const metrics = new AgentMetricsCollector(economy);
    const runtime = runtimeFor(engine, metrics);
    const simulate = vi.spyOn(engine, "dryRunAdmissions");
    const payload = JSON.stringify({
      candidate_vehicle_ids: [vehicle?.id ?? "missing"],
    });

    const first = runtime.execute(DRY_RUN_ADMIT, payload);
    const second = runtime.execute(DRY_RUN_ADMIT, payload);
    const third = runtime.execute(DRY_RUN_ADMIT, payload);

    expect(first.output).toMatchObject({ ok: true });
    expect(second.output).toMatchObject({ ok: true });
    expect(third.output).toEqual({
      ok: false,
      reason: "DRY_RUN_QUOTA_EXHAUSTED",
      message:
        "本周期 2 次试算配额已用完。只提交已经用完全相同参数验证通过的计划；若没有已验证计划，请提交空计划等待。",
    });
    expect(simulate).toHaveBeenCalledTimes(2);
    expect(metrics.snapshot().nonTerminalToolCalls).toBe(3);
  });

  it("dry-runs and commits multiple lane batches with one verified call", () => {
    const engine = new SimulationEngine({
      network: createRoadNetwork(),
      dynamics: {
        stallModulus: 1_000_000,
        creepAfterWaitingTicks: 1_000,
      },
    });
    for (const routeId of ["E_S1_STRAIGHT", "W_S1_STRAIGHT"]) {
      for (let index = 0; index < 2; index += 1) {
        engine.spawnVehicle(routeId, "MOTORCYCLE");
        for (let tick = 0; tick < 3; tick += 1) {
          engine.step();
        }
      }
    }
    advanceToStoplines(engine);
    const metrics = new AgentMetricsCollector(economy);
    const runtime = runtimeFor(engine, metrics);
    const eastHead = engine
      .buildObservation(0)
      .stoplineCandidates.find(
        (candidate) => candidate.routeId === "E_S1_STRAIGHT",
      );
    expect(eastHead).toBeDefined();
    const lane_batches = [
      { lane_id: "IN_E_S1_STRAIGHT", top_n: 2 },
      { lane_id: "IN_W_S1_STRAIGHT", top_n: 2 },
    ];
    const dryRun = runtime.execute(
      DRY_RUN_ADMIT,
      JSON.stringify({
        candidate_vehicle_ids: [eastHead?.vehicleId ?? "missing"],
        lane_batches,
      }),
    );
    expect(dryRun.output).toMatchObject({
      ok: true,
      resolved_vehicle_ids: expect.any(Array),
      vehicle_plans: expect.any(Array),
    });
    expect(JSON.stringify(dryRun.output)).not.toContain("enter_plan");

    const commit = runtime.execute(
      COMMIT_SCHEDULE,
      JSON.stringify({
        admit_vehicle_ids: [eastHead?.vehicleId ?? "missing"],
        lane_batches,
        sleep_ticks: 10,
        tactical_summary: "Parallel east-west platoons",
      }),
    );
    expect(commit.terminal).toBe(true);
    expect(commit.output).toMatchObject({
      committed: true,
      scheduled_vehicle_ids: expect.any(Array),
      vehicle_plans: expect.any(Array),
    });
    expect(
      new Set(
        (commit.output as { admitted_vehicle_ids?: string[] })
          .admitted_vehicle_ids ?? [],
      ).size,
    ).toBe(4);
    expect(metrics.snapshot().verifiedCommits).toBe(1);
  });

  it("dry-runs and atomically commits normalized pedestrian phases", () => {
    const engine = new SimulationEngine({
      network: createRoadNetwork(),
      seed: 10,
    });
    for (const [id, direction] of [
      ["phase-a", "A_TO_B"],
      ["phase-b", "B_TO_A"],
    ] as const) {
      const pedestrian = engine.spawnScheduledPedestrian({
        id,
        tick: 0,
        slot: 0,
        crosswalkId: "CROSSWALK:NORTH",
        direction,
      });
      if (pedestrian !== undefined) {
        movePedestrianToWaiting(pedestrian);
      }
    }
    const metrics = new AgentMetricsCollector(economy);
    const runtime = runtimeFor(engine, metrics);
    const before = engine.getSnapshot();
    const dryRun = runtime.execute(
      DRY_RUN_ADMIT,
      JSON.stringify({
        pedestrian_phases: [
          {
            crosswalk_id: "CROSSWALK:NORTH",
            directions: ["B_TO_A"],
          },
          {
            crosswalk_id: "CROSSWALK:NORTH",
            directions: ["A_TO_B"],
          },
        ],
      }),
    );

    expect(dryRun.output).toMatchObject({
      ok: true,
      resolved_vehicle_ids: [],
      pedestrian_cohorts: [
        {
          crosswalk_id: "CROSSWALK:NORTH",
          directions: ["A_TO_B", "B_TO_A"],
          pedestrian_ids: ["phase-a", "phase-b"],
          clear_tick: 32,
        },
      ],
    });
    expect(engine.getSnapshot()).toEqual(before);

    const commit = runtime.execute(
      COMMIT_SCHEDULE,
      JSON.stringify({
        pedestrian_phases: [
          {
            crosswalk_id: "CROSSWALK:NORTH",
            directions: ["B_TO_A", "A_TO_B"],
          },
        ],
        sleep_ticks: 2,
        tactical_summary: "Release both pedestrian directions",
      }),
    );
    expect(commit.output).toMatchObject({
      committed: true,
      admitted_vehicle_ids: [],
      pedestrian_cohorts: [
        {
          directions: ["A_TO_B", "B_TO_A"],
          pedestrian_ids: ["phase-a", "phase-b"],
        },
      ],
    });
    expect(metrics.snapshot().verifiedCommits).toBe(1);
    expect(engine.pedestrians.get("phase-a")?.state).toBe(
      "CROSSING_RESERVED",
    );
  });

  it("reports joint vehicle-pedestrian conflicts and preserves reckless commit semantics", () => {
    const engine = new SimulationEngine({
      network: createRoadNetwork(),
      seed: 5,
      dynamics: { stallModulus: 1_000_000 },
    });
    const vehicle = engine.spawnVehicle("N_R1_RIGHT", "MOTORCYCLE");
    advanceToStoplines(engine);
    const jointPedestrian = engine.spawnScheduledPedestrian({
      id: "joint-pedestrian",
      tick: engine.currentTick,
      slot: 0,
      crosswalkId: "CROSSWALK:NORTH",
      direction: "A_TO_B",
    });
    if (jointPedestrian !== undefined) {
      movePedestrianToWaiting(jointPedestrian);
    }
    const metrics = new AgentMetricsCollector(economy);
    const runtime = runtimeFor(engine, metrics);
    const payload = {
      candidate_vehicle_ids: [vehicle?.id],
      pedestrian_phases: [
        {
          crosswalk_id: "CROSSWALK:NORTH",
          directions: ["A_TO_B"],
        },
      ],
    };

    const dryRun = runtime.execute(
      DRY_RUN_ADMIT,
      JSON.stringify(payload),
    );
    expect(dryRun.output).toMatchObject({
      ok: false,
      conflict: expect.stringMatching(/^CROSSWALK:NORTH:CELL:/),
      vs: [vehicle?.id],
    });

    const commit = runtime.execute(
      COMMIT_SCHEDULE,
      JSON.stringify({
        admit_vehicle_ids: [vehicle?.id],
        pedestrian_phases: payload.pedestrian_phases,
        sleep_ticks: 1,
        tactical_summary: "Intentionally reckless joint commit",
      }),
    );
    expect(commit.output).toMatchObject({
      committed: true,
      admitted_vehicle_ids: [vehicle?.id],
      pedestrian_cohorts: [
        { pedestrian_ids: ["joint-pedestrian"] },
      ],
    });
    expect(engine.scheduledCollisionCount).toBeGreaterThan(0);
  });

  it("aborts the whole commit for an invalid phase and inspects finite details", () => {
    const engine = new SimulationEngine({
      network: createRoadNetwork(),
    });
    const vehicle = engine.spawnVehicle("S_S1_STRAIGHT", "MOTORCYCLE");
    advanceToStoplines(engine);
    const inspectPedestrian = engine.spawnScheduledPedestrian({
      id: "inspect-pedestrian",
      tick: engine.currentTick,
      slot: 0,
      crosswalkId: "CROSSWALK:SOUTH",
      direction: "B_TO_A",
    });
    if (inspectPedestrian !== undefined) {
      movePedestrianToWaiting(inspectPedestrian);
    }
    const metrics = new AgentMetricsCollector(economy);
    const runtime = runtimeFor(engine, metrics);
    const inspect = runtime.execute(
      INSPECT_CROSSWALK,
      JSON.stringify({
        crosswalk_id: "CROSSWALK:SOUTH",
        limit: 1,
      }),
    );
    expect(inspect.output).toMatchObject({
      crosswalk_id: "CROSSWALK:SOUTH",
      pedestrians: [
        {
          id: "inspect-pedestrian",
          direction: "B_TO_A",
          state: "WAITING",
        },
      ],
    });

    const commit = runtime.execute(
      COMMIT_SCHEDULE,
      JSON.stringify({
        admit_vehicle_ids: [vehicle?.id],
        pedestrian_phases: [
          {
            crosswalk_id: "CROSSWALK:UNKNOWN",
            directions: ["A_TO_B"],
          },
        ],
        sleep_ticks: 1,
        tactical_summary: "Invalid atomic phase",
      }),
    );
    expect(commit.output).toMatchObject({
      committed: false,
      admitted_vehicle_ids: [],
      error: "UNKNOWN_CROSSWALK:CROSSWALK:UNKNOWN",
    });
    expect(vehicle?.state).toBe("AT_STOPLINE");
  });

  it("previews and commits an explicit speed profile without dry-run mutation", () => {
    const engine = new SimulationEngine({ network: createRoadNetwork() });
    const vehicle = engine.spawnVehicle("N_S1_STRAIGHT", "MOTORCYCLE");
    advanceToStoplines(engine);
    expect(vehicle).toBeDefined();
    if (vehicle === undefined) {
      return;
    }
    const metrics = new AgentMetricsCollector(economy);
    const runtime = runtimeFor(engine, metrics);
    const before = engine.getSnapshot();
    const speed = [{
      vehicle_id: vehicle.id,
      speed_profile: "BURST",
    }];

    const dryRun = runtime.execute(
      DRY_RUN_ADMIT,
      JSON.stringify({
        candidate_vehicle_ids: [vehicle.id],
        vehicle_speed_profiles: speed,
      }),
    );
    expect(dryRun.output).toMatchObject({
      ok: true,
      vehicle_plans: [[vehicle.id, "B", engine.currentTick, expect.any(Number), 0]],
    });
    expect(engine.getSnapshot()).toEqual(before);

    const commit = runtime.execute(
      COMMIT_SCHEDULE,
      JSON.stringify({
        admit_vehicle_ids: [vehicle.id],
        vehicle_speed_profiles: speed,
        sleep_ticks: 1,
        tactical_summary: "Burst through a clear route",
      }),
    );
    expect(commit.output).toMatchObject({
      committed: true,
      vehicle_plans: [[vehicle.id, "B", expect.any(Number), expect.any(Number), 0]],
    });
    expect(vehicle.speedProfile).toBe("BURST");
    expect(metrics.snapshot().verifiedCommits).toBe(1);
  });

  it("rejects invalid explicit speed profile ownership and duplicates", () => {
    const engine = new SimulationEngine({ network: createRoadNetwork() });
    const vehicle = engine.spawnVehicle("N_S1_STRAIGHT", "MOTORCYCLE");
    advanceToStoplines(engine);
    const metrics = new AgentMetricsCollector(economy);
    const runtime = runtimeFor(engine, metrics);

    const outside = runtime.execute(
      DRY_RUN_ADMIT,
      JSON.stringify({
        candidate_vehicle_ids: [],
        lane_batches: [{ lane_id: "IN_N_S1_STRAIGHT", top_n: 1 }],
        vehicle_speed_profiles: [{
          vehicle_id: vehicle?.id,
          speed_profile: "BURST",
        }],
      }),
    );
    expect(outside.output).toMatchObject({
      error: { code: "TOOL_EXECUTION_ERROR" },
    });

    const duplicate = runtime.execute(
      DRY_RUN_ADMIT,
      JSON.stringify({
        candidate_vehicle_ids: [vehicle?.id],
        vehicle_speed_profiles: [
          { vehicle_id: vehicle?.id, speed_profile: "CRUISE" },
          { vehicle_id: vehicle?.id, speed_profile: "BURST" },
        ],
      }),
    );
    expect(duplicate.output).toMatchObject({
      error: { code: "TOOL_EXECUTION_ERROR" },
    });

    const unknown = runtime.execute(
      DRY_RUN_ADMIT,
      JSON.stringify({
        candidate_vehicle_ids: ["missing-profile-vehicle"],
        vehicle_speed_profiles: [{
          vehicle_id: "missing-profile-vehicle",
          speed_profile: "CRUISE",
        }],
      }),
    );
    expect(unknown.output).toMatchObject({
      ok: false,
      reason: "UNKNOWN_PROFILE_VEHICLE:missing-profile-vehicle",
    });
  });

  it("does not verify the same vehicle under a different speed profile", () => {
    const engine = new SimulationEngine({ network: createRoadNetwork() });
    const vehicle = engine.spawnVehicle("S_S1_STRAIGHT", "MOTORCYCLE");
    advanceToStoplines(engine);
    const metrics = new AgentMetricsCollector(economy);
    const runtime = runtimeFor(engine, metrics);
    runtime.execute(
      DRY_RUN_ADMIT,
      JSON.stringify({
        candidate_vehicle_ids: [vehicle?.id],
        vehicle_speed_profiles: [{
          vehicle_id: vehicle?.id,
          speed_profile: "SLOW_SLIDE",
        }],
      }),
    );
    runtime.execute(
      COMMIT_SCHEDULE,
      JSON.stringify({
        admit_vehicle_ids: [vehicle?.id],
        vehicle_speed_profiles: [{
          vehicle_id: vehicle?.id,
          speed_profile: "BURST",
        }],
        sleep_ticks: 1,
        tactical_summary: "Changed speed after verification",
      }),
    );

    expect(metrics.snapshot()).toMatchObject({
      verifiedCommits: 0,
      unverifiedCommits: 1,
    });
  });

  it("shows locked profiles only for active or scheduled vehicles", () => {
    const engine = new SimulationEngine({ network: createRoadNetwork() });
    const active = engine.spawnVehicle("E_S1_STRAIGHT", "MOTORCYCLE");
    const waiting = engine.spawnVehicle("W_S1_STRAIGHT", "MOTORCYCLE");
    advanceToStoplines(engine);
    expect(active).toBeDefined();
    expect(waiting).toBeDefined();
    if (active === undefined || waiting === undefined) {
      return;
    }
    engine.commitSchedule(
      [active.id],
      [],
      [],
      [{ vehicleId: active.id, speedProfile: "SLOW_SLIDE" }],
    );

    const compact = compactObservationForModel(engine.buildObservation(0));
    expect(compact.activeVehicleMotions).toEqual([
      [active.id, "E_S1_STRAIGHT", "X", "S"],
    ]);
    expect(JSON.stringify(compact.activeVehicleMotions)).not.toContain(
      waiting.id,
    );
  });
});

describe("tool call runner", () => {
  it("tolerates a non-terminal tool followed by commit in one response", async () => {
    const engine = new SimulationEngine({ network: createRoadNetwork() });
    const vehicle = engine.spawnVehicle("N_S1_STRAIGHT", "MOTORCYCLE");
    advanceToStoplines(engine);
    const vehicleId = vehicle?.id ?? "missing";
    const client = mockClient([
      completion([
        toolCall("dry", DRY_RUN_ADMIT, {
          candidate_vehicle_ids: [vehicleId],
        }),
        toolCall("commit", COMMIT_SCHEDULE, {
          admit_vehicle_ids: [vehicleId],
          sleep_ticks: 3,
          tactical_summary: "Safe verified flow",
        }),
      ]),
      completion([
        toolCall("next-commit", COMMIT_SCHEDULE, {
          admit_vehicle_ids: [],
          sleep_ticks: 1,
          tactical_summary: "Acknowledge prior warning",
        }),
      ]),
    ]);
    const runner = createRunner(client.client, engine, 8);

    const result = await runner.runCycle({ financialBalance: 0 });

    expect(result.usedFallback).toBe(false);
    expect(result.commit.admission.admittedVehicleIds).toEqual([vehicleId]);
    expect(result.metrics.verifiedCommits).toBe(1);
    expect(result.metrics.warnings).toContain("warning_parallel_terminal");
    expect(result.metrics.penaltiesCharged).toBe(0.5);

    await runner.runCycle({ financialBalance: -0.65 });
    expect(JSON.stringify(client.requests[1])).toContain(
      "warning_parallel_terminal",
    );
  });

  it("adds a mandatory commit warning on the penultimate API round", async () => {
    const engine = new SimulationEngine({ network: createRoadNetwork() });
    const client = mockClient([
      completion([
        toolCall("inspect", INSPECT_LANE_QUEUE, {
          lane_id: "IN_N_S1_STRAIGHT",
          depth: 1,
        }),
      ]),
      completion([
        toolCall("dry", DRY_RUN_ADMIT, {
          candidate_vehicle_ids: [],
        }),
      ]),
      completion([
        toolCall("commit", COMMIT_SCHEDULE, {
          admit_vehicle_ids: [],
          sleep_ticks: 1,
          tactical_summary: "No candidates",
        }),
      ]),
    ]);
    const runner = createRunner(client.client, engine, 3);

    const result = await runner.runCycle({ financialBalance: 0 });
    const thirdRequest = JSON.stringify(client.requests[2]);

    expect(result.usedFallback).toBe(false);
    expect(thirdRequest).toContain("SYSTEM WARNING");
    expect(thirdRequest).toContain("必须调用 commit_schedule");
    expect(result.metrics.apiCalls).toBe(3);
    expect(result.metrics.decisionTaxCharged).toBe(6);
  });

  it("uses StepFun compatibility mode and replays one reasoning field", async () => {
    expect(
      detectReasoningFormat("https://api.stepfun.com/v1", "step-5-preview"),
    ).toBe("deepseek-style");
    expect(
      detectReasoningFormat("https://proxy.example/v1", "step-5-preview"),
    ).toBe("deepseek-style");
    expect(
      detectReasoningFormat("https://api.deepseek.com", "deepseek-v4-pro"),
    ).toBeUndefined();

    const engine = new SimulationEngine({ network: createRoadNetwork() });
    const client = mockClient([
      completion(
        [
          toolCall("inspect", INSPECT_LANE_QUEUE, {
            lane_id: "IN_N_S1_STRAIGHT",
            depth: 1,
          }),
        ],
        {
          reasoning: "same reasoning",
          reasoning_content: "same reasoning",
        },
      ),
      completion([
        toolCall("commit", COMMIT_SCHEDULE, {
          admit_vehicle_ids: [],
          sleep_ticks: 1,
          tactical_summary: "Done",
        }),
      ]),
    ]);
    const runner = createRunner(
      client.client,
      engine,
      3,
      new SilentAgentApiLogger(),
      12,
      "deepseek-style",
    );

    await runner.runCycle({ financialBalance: 0 });

    const firstRequest = client.requests[0] as {
      reasoning_format?: string;
    };
    const secondRequest = client.requests[1] as {
      messages?: Array<Record<string, unknown>>;
    };
    const assistant = secondRequest.messages?.find(
      (message) => message.role === "assistant",
    );
    expect(firstRequest.reasoning_format).toBe("deepseek-style");
    expect(assistant?.reasoning_content).toBe("same reasoning");
    expect(assistant).not.toHaveProperty("reasoning");
  });

  it("normalizes native reasoning to reasoning_content", async () => {
    const engine = new SimulationEngine({ network: createRoadNetwork() });
    const client = mockClient([
      completion(
        [
          toolCall("inspect", INSPECT_LANE_QUEUE, {
            lane_id: "IN_N_S1_STRAIGHT",
            depth: 1,
          }),
        ],
        { reasoning: "native reasoning" },
      ),
      completion([
        toolCall("commit", COMMIT_SCHEDULE, {
          admit_vehicle_ids: [],
          sleep_ticks: 1,
          tactical_summary: "Done",
        }),
      ]),
    ]);
    const runner = createRunner(client.client, engine, 3);

    await runner.runCycle({ financialBalance: 0 });

    const secondRequest = client.requests[1] as {
      messages?: Array<Record<string, unknown>>;
    };
    const assistant = secondRequest.messages?.find(
      (message) => message.role === "assistant",
    );
    expect(assistant?.reasoning_content).toBe("native reasoning");
    expect(assistant).not.toHaveProperty("reasoning");
    expect(client.requests[0]).not.toHaveProperty("reasoning_format");
  });

  it("sends Cerebras reasoning_effort and drops replayed reasoning", async () => {
    expect(
      resolveProviderRequestProfile("https://api.cerebras.ai/v1", "low"),
    ).toEqual({
      reasoningEffort: "low",
      replayReasoningContent: false,
    });
    expect(
      resolveProviderRequestProfile("https://api.openai.com/v1", "low"),
    ).toEqual({
      replayReasoningContent: true,
    });
    expect(
      resolveProviderRequestProfile("https://api.cerebras.ai/v1", undefined),
    ).toEqual({
      replayReasoningContent: false,
    });

    const engine = new SimulationEngine({ network: createRoadNetwork() });
    const client = mockClient([
      completion(
        [
          toolCall("inspect", INSPECT_LANE_QUEUE, {
            lane_id: "IN_N_S1_STRAIGHT",
            depth: 1,
          }),
        ],
        { reasoning: "cerebras reasoning" },
      ),
      completion([
        toolCall("commit", COMMIT_SCHEDULE, {
          admit_vehicle_ids: [],
          sleep_ticks: 1,
          tactical_summary: "Done",
        }),
      ]),
    ]);
    const runner = createRunner(
      client.client,
      engine,
      3,
      new SilentAgentApiLogger(),
      12,
      undefined,
      "low",
      false,
    );

    await runner.runCycle({ financialBalance: 0 });

    const firstRequest = client.requests[0] as { reasoning_effort?: string };
    const secondRequest = client.requests[1] as {
      messages?: Array<Record<string, unknown>>;
      reasoning_effort?: string;
    };
    const assistant = secondRequest.messages?.find(
      (message) => message.role === "assistant",
    );
    expect(firstRequest.reasoning_effort).toBe("low");
    expect(secondRequest.reasoning_effort).toBe("low");
    expect(assistant).not.toHaveProperty("reasoning_content");
    expect(assistant).not.toHaveProperty("reasoning");
  });

  it("records full API request and response payloads", async () => {
    const engine = new SimulationEngine({ network: createRoadNetwork() });
    const client = mockClient([
      completion([
        toolCall("commit", COMMIT_SCHEDULE, {
          admit_vehicle_ids: [],
          sleep_ticks: 1,
          tactical_summary: "Empty commit",
        }),
      ]),
    ]);
    const logger = new CapturingAgentApiLogger();
    const runner = createRunner(client.client, engine, 3, logger);

    await runner.runCycle({ financialBalance: 12.345678 });

    expect(logger.records.map((record) => record.event)).toEqual([
      "API_REQUEST",
      "API_RESPONSE",
      "TOOL_CALL",
      "TOOL_RESULT",
    ]);
    expect(logger.rawRecords.map((record) => record.event)).toEqual([
      "API_REQUEST",
      "API_RESPONSE",
    ]);
    expect(logger.rawRecords[1]?.payload).toHaveProperty("choices");
    const request = JSON.stringify(logger.records[0]?.payload);
    expect(request).toContain("你是这个路口的交通调度代理");
    expect(request).toContain("3 轮 API");
    expect(request).toContain("首要目标是让最终财务余额尽可能高");
    expect(request).toContain("基线，不是最优策略");
    expect(request).toContain("连续静止满 10 tick");
    expect(request).toContain("摩托车 0.2");
    expect(request).toContain("开局余额为 1000");
    expect(request).toContain("普通车辆每位乘员 0.1（一辆公交 4）");
    expect(request).toContain("特殊车辆按车计 1。");
    expect(request).toContain("VEHICLE_RED_LIGHT");
    expect(request).toContain("tailgate_risk");
    expect(request).toContain("driverAlerts");
    expect(request).toContain("停止线前 24 格");
    expect(request).toContain("12 格");
    expect(request).toContain("界外 FIFO");
    expect(request).toContain("积压车上的每位乘员每拍扣 0.002；");
    expect(request).toContain("每位乘员一次性扣 0.1");
    expect(request).toContain("闯红灯过街不奖励");
    expect(request).toContain("sleep_ticks 会把这些车的堵住时间继续往前推");
    expect(request).toContain("recentCycles");
    expect(request).toContain("DRY_RUN_QUOTA_EXHAUSTED");
    expect(request).toContain("TARGET_LANE_SLOT_OCCUPIED");
    const requestPayload = logger.records[0]?.payload as {
      messages?: Array<{ role?: string; content?: string }>;
    };
    const userPayload = JSON.parse(
      requestPayload.messages?.find((message) => message.role === "user")
        ?.content ?? "{}",
    ) as { observation?: { financialBalance?: number } };
    expect(userPayload.observation?.financialBalance).toBe(12.3457);
    expect(buildTrafficSystemPrompt(8)).toContain("8 轮 API");
    expect(JSON.stringify(logger.records[1]?.payload)).toContain(
      "commit_schedule",
    );
    expect(JSON.stringify(logger.records)).not.toMatch(/sk-|api[_-]?key/i);
  });

  it("places the previous financial settlement at the end of model input", async () => {
    const settlement: AgentSettlementSummary = buildAgentSettlementSummary({
      cycle: 4,
      startingBalance: 100,
      endingBalance: 522.08,
      revenue: 600,
      pedestrianReward: 8,
      metrics: {
        decisionTaxCharged: 4,
        toolTaxCharged: 0.3,
        penaltiesCharged: 0.5,
      },
      delay: 1.42,
      emergencyDelay: 0.3,
      stallChain: 0.8,
      upstream: 0,
      hazard: 0.4,
      exitLock: 0.2,
      tow: 120,
      secondary: 50,
      pedestrianDelay: 0.12,
      pedestrianJaywalk: 60,
      pedestrianStrike: 500,
    });
    const engine = new SimulationEngine({ network: createRoadNetwork() });
    const client = mockClient([
      completion([
        toolCall("commit", COMMIT_SCHEDULE, {
          admit_vehicle_ids: [],
          sleep_ticks: 1,
          tactical_summary: "Observe settlement",
        }),
      ]),
    ]);
    const logger = new CapturingAgentApiLogger();
    const runner = createRunner(client.client, engine, 3, logger);

    await runner.runCycle({
      financialBalance: settlement.endingBalance,
      lastSettlement: settlement,
    });

    const request = logger.records.find((record) => record.event === "API_REQUEST");
    const messages = (
      request?.payload as { messages?: Array<{ role?: string; content?: string }> }
    ).messages;
    const user = JSON.parse(
      messages?.find((message) => message.role === "user")?.content ?? "{}",
    ) as Record<string, unknown>;
    expect(Object.keys(user).at(-1)).toBe("lastSettlement");
    const nonZeroCosts = Object.fromEntries(
      Object.entries(settlement.costs).filter(([, value]) => value !== 0),
    );
    expect(settlement.costs.upstream).toBe(0);
    expect(nonZeroCosts).not.toHaveProperty("upstream");
    expect(user.lastSettlement).toEqual({
      ...settlement,
      costs: nonZeroCosts,
      netDelta: 422.08,
    });
    expect(settlement.netDelta).toBeCloseTo(422.08);
    expect(settlement.pedestrianReward).toBe(8);
    expect(settlement.costs).toMatchObject({
      pedestrianDelay: 0.12,
      pedestrianJaywalk: 60,
      pedestrianStrike: 500,
    });
    expect(buildTrafficSystemPrompt(3)).toContain(
      "lastSettlement 是上一完整周期的财务结算",
    );
  });

  it("sends a deterministic compact observation without changing replay data", async () => {
    const engine = new SimulationEngine({ network: createRoadNetwork() });
    engine.spawnVehicle("N_S1_STRAIGHT", "MOTORCYCLE");
    engine.spawnVehicle("S_S1_STRAIGHT", "city-builder:car_police");
    advanceToStoplines(engine);
    const observation = engine.buildObservation(12.3456);
    const compact = compactObservationForModel(observation);
    const repeated = compactObservationForModel(observation);
    const candidates = compact.stoplineCandidates as unknown[][];

    expect(JSON.stringify(compact)).toBe(JSON.stringify(repeated));
    expect(JSON.stringify(compact).length).toBeLessThan(
      JSON.stringify(observation).length,
    );
    expect(compact).not.toHaveProperty("candidateConflictScope");
    expect(compact).not.toHaveProperty("activeLaneHolds");
    expect(compact).not.toHaveProperty("lanePressureSignals");
    expect(compact).not.toHaveProperty("upstreamQueues");
    expect(compact).not.toHaveProperty("blockedRoutes");
    expect(candidates.map((candidate) => candidate[1]).sort()).toEqual(["E", "M"]);
    expect(candidates.every((candidate) => Array.isArray(candidate))).toBe(true);
    expect(JSON.stringify(compact)).not.toContain("delayBleedPerTick");
    expect(JSON.stringify(compact)).not.toContain("chargeActive");
    expect(observation).toHaveProperty("candidateConflictScope");
    expect(observation.stoplineCandidates[0]).toHaveProperty("type");
    expect(buildTrafficSystemPrompt(3)).toContain("缺失的集合字段表示空集合");
    expect(buildTrafficSystemPrompt(3)).toContain("最多 2 个");
    expect(compact).not.toHaveProperty("endTick");
  });

  it("tells the model the absolute end tick and the ticks remaining", () => {
    const engine = new SimulationEngine({ network: createRoadNetwork() });
    advanceToStoplines(engine);
    const observation = engine.buildObservation(0);
    const endTick = observation.currentTick + 25;
    expect(compactObservationForModel(observation, endTick)).toMatchObject({
      endTick,
      ticksRemaining: 25,
    });
    const prompt = buildTrafficSystemPrompt(3, { horizonTicks: 200, endTick: 261 });
    expect(prompt).toContain("currentTick 到达 261 时结束");
    expect(prompt).toContain("ticksRemaining");
  });

  it("sends only the two most recent compressed cycles", async () => {
    const engine = new SimulationEngine({ network: createRoadNetwork() });
    const client = mockClient([
      completion([
        toolCall("first", COMMIT_SCHEDULE, {
          admit_vehicle_ids: [],
          sleep_ticks: 4,
          tactical_summary: "Hold the east-west axis",
        }),
      ]),
      completion([
        toolCall("second", COMMIT_SCHEDULE, {
          admit_vehicle_ids: [],
          sleep_ticks: 2,
          tactical_summary: "Continue",
        }),
      ]),
      completion([
        toolCall("third", COMMIT_SCHEDULE, {
          admit_vehicle_ids: [],
          sleep_ticks: 3,
          tactical_summary: "Continue again",
        }),
      ]),
      completion([
        toolCall("fourth", COMMIT_SCHEDULE, {
          admit_vehicle_ids: [],
          sleep_ticks: 1,
          tactical_summary: "Final cycle",
        }),
      ]),
    ]);
    const logger = new CapturingAgentApiLogger();
    const runner = createRunner(client.client, engine, 3, logger);

    await runner.runCycle({ financialBalance: -10 });
    await runner.runCycle({ financialBalance: -14 });
    await runner.runCycle({ financialBalance: -18 });
    await runner.runCycle({ financialBalance: -22 });

    const fourthRequest = logger.records.filter(
      (record) => record.event === "API_REQUEST",
    )[3];
    const messages = (
      fourthRequest?.payload as { messages?: { content?: string }[] }
    ).messages;
    const user = JSON.parse(messages?.[1]?.content ?? "{}") as {
      recentCycles: {
        cycle: number;
        sleepTicks: number;
        balance: number;
        tacticalSummary: string;
        admittedVehicleIds: string[];
      }[];
    };
    expect(user.recentCycles).toHaveLength(2);
    expect(user.recentCycles.map((cycle) => cycle.cycle)).toEqual([2, 3]);
    expect(user.recentCycles[1]).toMatchObject({
      cycle: 3,
      sleepTicks: 3,
      balance: -18,
      tacticalSummary: "Continue again",
      admittedVehicleIds: [],
    });
    expect(JSON.stringify(user.recentCycles[0])).not.toContain("stoplineCandidates");
  });

  it("pretty-prints API records to the console sink and JSONL writer", () => {
    const lines: string[] = [];
    const rawLines: string[] = [];
    const printed: string[] = [];
    const logger = new FileAgentApiLogger({
      write: (line) => lines.push(line),
      rawWrite: (line) => rawLines.push(line),
      print: (text) => printed.push(text),
    });

    logger.log({
      timestamp: "2026-09-21T00:00:00.000Z",
      event: "API_REQUEST",
      tick: 12,
      cycle: 1,
      round: 1,
      payload: { model: "test-model", messages: [{ role: "user", content: "hi" }] },
    });
    logger.logRaw({
      timestamp: "2026-09-21T00:00:00.000Z",
      event: "API_RESPONSE",
      tick: 12,
      cycle: 1,
      round: 1,
      payload: {
        choices: [
          {
            message: {
              content: "visible",
              reasoning_content: "provider reasoning",
            },
          },
        ],
      },
    });

    expect(lines[0]).toContain("\"event\":\"API_REQUEST\"");
    expect(rawLines[0]).toContain("\"reasoning_content\":\"provider reasoning\"");
    expect(printed[0]).toContain("[agent-api] API_REQUEST tick=12 cycle=1 round=1");
    expect(printed[0]).toContain("test-model");
  });

  it("still commits when the tool quota is exhausted but commit_schedule is present", async () => {
    const engine = new SimulationEngine({ network: createRoadNetwork() });
    const vehicle = engine.spawnVehicle("N_S1_STRAIGHT", "MOTORCYCLE");
    advanceToStoplines(engine);
    const vehicleId = vehicle?.id ?? "missing";
    const client = mockClient([
      completion([
        toolCall("dry-1", DRY_RUN_ADMIT, { candidate_vehicle_ids: [vehicleId] }),
        toolCall("dry-2", DRY_RUN_ADMIT, { candidate_vehicle_ids: [vehicleId] }),
        toolCall("commit", COMMIT_SCHEDULE, {
          admit_vehicle_ids: [vehicleId],
          sleep_ticks: 1,
          tactical_summary: "Quota exemption",
        }),
      ]),
    ]);
    const runner = createRunner(client.client, engine, 3, new SilentAgentApiLogger(), 1);

    const result = await runner.runCycle({ financialBalance: 0 });

    expect(result.usedFallback).toBe(false);
    expect(result.commit.admission.admittedVehicleIds).toEqual([vehicleId]);
    expect(result.metrics.warnings).toContain("warning_tool_quota_skipped");
  });

  it("injects a quota warning when two non-terminal calls remain", async () => {
    const engine = new SimulationEngine({ network: createRoadNetwork() });
    const client = mockClient([
      completion([
        toolCall("inspect", INSPECT_LANE_QUEUE, {
          lane_id: "IN_N_S1_STRAIGHT",
          depth: 1,
        }),
      ]),
      completion([
        toolCall("commit", COMMIT_SCHEDULE, {
          admit_vehicle_ids: [],
          sleep_ticks: 1,
          tactical_summary: "Warned then committed",
        }),
      ]),
    ]);
    const runner = createRunner(client.client, engine, 3, new SilentAgentApiLogger(), 3);

    await runner.runCycle({ financialBalance: 0 });

    expect(JSON.stringify(client.requests[1])).toContain("quota_warning");
    expect(JSON.stringify(client.requests[1])).toContain("还剩 2 次");
  });

  it("marks expired working-memory plans in the observation", async () => {
    const engine = new SimulationEngine({ network: createRoadNetwork() });
    const memory = new WorkingMemoryStack();
    memory.save({ phaseName: "EAST_WEST_CLEARING", intendedDuration: 1 }, 0);
    engine.step();
    const client = mockClient([
      completion([
        toolCall("commit", COMMIT_SCHEDULE, {
          admit_vehicle_ids: [],
          sleep_ticks: 1,
          tactical_summary: "Check memory",
        }),
      ]),
    ]);
    const runner = new ToolCallAgentRunner({
      client: client.client,
      engine,
      memory,
      model: "test-model",
      maxTokens: 1024,
      maxApiRounds: 3,
      maxToolCalls: 12,
      economy,
      tollMotorcycle: 5,
      tollStandard: 20,
      tollEmergency: 50,
      logger: new SilentAgentApiLogger(),
    });

    const result = await runner.runCycle({ financialBalance: 0 });

    expect(result.observation.workingMemoryTop).toEqual({
      phaseName: "EAST_WEST_CLEARING",
      targetTick: 1,
      isExpired: true,
      depth: 1,
    });
  });

  it("computes finite positive decode speed from visible output tokens", () => {
    const stats = describeTokenUsage(
      {
        prompt_tokens: 20,
        completion_tokens: 10,
        completion_tokens_details: { reasoning_tokens: 4 },
      },
      2000,
    );

    expect(stats.outputTokens).toBe(6);
    expect(stats.decodeTokensPerSec).toBe(3);
    expect(stats.generationTokensPerSec).toBe(5);
    expect(Number.isFinite(stats.decodeTokensPerSec)).toBe(true);
  });
});

function createRunner(
  client: OpenAI,
  engine: SimulationEngine,
  maxApiRounds: number,
  logger = new SilentAgentApiLogger(),
  maxToolCalls = 12,
  reasoningFormat?: ReasoningFormat,
  reasoningEffort?: ReasoningEffort,
  replayReasoningContent?: boolean,
): ToolCallAgentRunner {
  return new ToolCallAgentRunner({
    client,
    engine,
    memory: new WorkingMemoryStack(),
    model: "test-model",
    ...(reasoningFormat === undefined ? {} : { reasoningFormat }),
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    ...(replayReasoningContent === undefined
      ? {}
      : { replayReasoningContent }),
    maxTokens: 1024,
    maxApiRounds,
    maxToolCalls,
    economy,
    tollMotorcycle: 5,
    tollStandard: 20,
    tollEmergency: 50,
    logger,
  });
}

function toolCall(id: string, name: string, input: unknown) {
  return {
    id,
    type: "function" as const,
    function: { name, arguments: JSON.stringify(input) },
  };
}

function completion(
  toolCalls: readonly ReturnType<typeof toolCall>[],
  reasoning: {
    readonly reasoning?: string;
    readonly reasoning_content?: string;
  } = {},
) {
  return {
    id: "completion",
    object: "chat.completion",
    created: 0,
    model: "test-model",
    choices: [
      {
        index: 0,
        finish_reason: "tool_calls",
        logprobs: null,
        message: {
          role: "assistant",
          content: null,
          refusal: null,
          tool_calls: toolCalls,
          ...reasoning,
        },
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    },
  } as unknown as OpenAI.Chat.Completions.ChatCompletion;
}

function mockClient(
  responses: OpenAI.Chat.Completions.ChatCompletion[],
): { client: OpenAI; requests: unknown[] } {
  const requests: unknown[] = [];
  const client = {
    chat: {
      completions: {
        create: async (request: unknown) => {
          requests.push(request);
          const response = responses.shift();
          if (response === undefined) {
            throw new Error("No mock completion remains");
          }
          return response;
        },
      },
    },
  };
  return { client: client as unknown as OpenAI, requests };
}

function movePedestrianToWaiting(pedestrian: Pedestrian): void {
  if (
    pedestrian.targetWaitingCellId === undefined ||
    pedestrian.targetWaitingSubslot === undefined
  ) {
    throw new Error(`Missing waiting target for ${pedestrian.id}`);
  }
  pedestrian.state = "WAITING";
  pedestrian.waitingCellId = pedestrian.targetWaitingCellId;
  pedestrian.waitingSubslot = pedestrian.targetWaitingSubslot;
  pedestrian.waitingStartedTick = pedestrian.generatedAtTick;
  delete pedestrian.approachPathId;
  delete pedestrian.approachIndex;
  delete pedestrian.approachCellId;
  delete pedestrian.targetWaitingCellId;
  delete pedestrian.targetWaitingSubslot;
  delete pedestrian.nextMoveTick;
}
