import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SimulationEngine } from "../src/core/engine.js";
import { createRoadNetwork } from "../src/core/network.js";
import { createRunArtifactStore } from "../src/io/artifacts.js";
import { writeReplayBundle } from "../src/io/replay-writer.js";
import { ReplayRecorder } from "../src/replay/recorder.js";
import { REPLAY_SCHEMA_VERSION } from "../src/replay/types.js";
import type { AgentCycleResult } from "../src/agent/runner.js";
import type { Vehicle } from "../src/core/types.js";

const emptyMetrics = {
  apiCalls: 1,
  nonTerminalToolCalls: 1,
  toolCallsByName: { dry_run_admit: 1 },
  promptTokens: 0,
  completionTokens: 0,
  reasoningTokens: 0,
  outputTokens: 0,
  avgDecodeTokensPerSec: 0,
  maxDecodeTokensPerSec: 0,
  avgGenerationTokensPerSec: 0,
  maxGenerationTokensPerSec: 0,
  wallClockLatencyMs: 1,
  decisionTaxCharged: 2,
  toolTaxCharged: 0.15,
  penaltiesCharged: 0,
  financialDelta: -2.15,
  recklessAttempts: 0,
  holdCommits: 0,
  unverifiedCommits: 0,
  verifiedCommits: 1,
  protocolViolations: 0,
  warnings: [],
} as const;

function cycleResult(
  engine: SimulationEngine,
  vehicle: Vehicle,
): AgentCycleResult {
  const admission = engine.applyAdmissions([vehicle.id]);
  return {
    commit: {
      admission,
      sleepTicks: 2,
      tacticalSummary: "Admit the waiting sedan",
    },
    metrics: emptyMetrics,
    observation: engine.buildObservation(0),
    usedFallback: false,
    trace: [
      {
        kind: "MODEL_RESPONSE",
        round: 1,
        data: {
          content: null,
          finishReason: "tool_calls",
          toolCalls: [
            {
              id: "call-1",
              type: "function",
              function: {
                name: "dry_run_admit",
                arguments: JSON.stringify({
                  candidate_vehicle_ids: [vehicle.id],
                }),
              },
            },
          ],
        },
      },
      {
        kind: "TOOL_RESULT",
        round: 1,
        data: {
          toolCallId: "call-1",
          toolName: "dry_run_admit",
          output: { ok: true, reward: 10 },
        },
      },
    ],
  };
}

function recordShortRun(seed = 7): ReturnType<ReplayRecorder["finalize"]> {
  const network = createRoadNetwork();
  const engine = new SimulationEngine({ network, seed });
  const recorder = new ReplayRecorder({
    network,
    identity: {
      model: "test-model",
      testDate: "2026-09-21",
      postfix: "000001",
    },
    model: "test-model",
    seed,
    tickDurationMs: 100,
    warmupTicks: 8,
  });

  recorder.recordFrame(
    engine.currentTick,
    engine.vehicles.values(),
    engine.pedestrians.values(),
    "tick",
  );
  const spawned: Vehicle[] = [];
  const first = engine.spawnVehicle("N_S1_STRAIGHT", "SEDAN");
  if (first !== undefined) {
    spawned.push(first);
  }
  recorder.recordSpawns(engine.currentTick, spawned);
  for (let tick = 0; tick < 24; tick += 1) {
    const stepped = engine.step();
    recorder.recordDespawns(stepped.despawnEvents);
    recorder.recordFrame(
      engine.currentTick,
      engine.vehicles.values(),
      engine.pedestrians.values(),
      "tick",
    );
  }
  if (first === undefined) {
    throw new Error("expected spawned sedan");
  }
  const result = cycleResult(engine, first);
  recorder.recordCycle(result, engine.vehicles, 0);
  recorder.recordFrame(
    engine.currentTick,
    engine.vehicles.values(),
    engine.pedestrians.values(),
    "decision",
  );
  for (let step = 0; step < result.commit.sleepTicks; step += 1) {
    const stepped = engine.step();
    recorder.recordDespawns(stepped.despawnEvents);
    recorder.recordFrame(
      engine.currentTick,
      engine.vehicles.values(),
      engine.pedestrians.values(),
      "tick",
    );
  }
  return recorder.finalize();
}

describe("replay recorder", () => {
  it("records a deterministic bundle with aligned cycles and dry-run geometry", () => {
    const left = recordShortRun(7);
    const right = recordShortRun(7);
    expect(left).toEqual(right);
    expect(left.schemaVersion).toBe(REPLAY_SCHEMA_VERSION);
    expect(left.cycles).toHaveLength(1);
    const cycle = left.cycles[0];
    expect(cycle).toBeDefined();
    if (cycle === undefined) {
      return;
    }
    expect(cycle.decisionTick + cycle.sleepTicks).toBe(cycle.physicsEndTick);
    expect(cycle.admittedVehicleIds).toHaveLength(1);

    const admitted = left.frames.find((frame) => frame.phase === "decision")
      ?.vehicles[0];
    expect(admitted?.state).toBe("CROSSING");

    const dryRun = left.events.find((event) => event.kind === "DRY_RUN_ADMIT");
    expect(dryRun?.payload).toMatchObject({
      feasible: true,
      candidates: [{ routeId: "N_S1_STRAIGHT" }],
      reservationPreview: [
        {
          vehicleId: firstVehicleId(left),
          routeId: "N_S1_STRAIGHT",
        },
      ],
    });
    const dryRunPreview = (
      dryRun?.payload as {
        reservationPreview?: Array<{ steps: Array<{ resourceIds: string[] }> }>;
      }
    ).reservationPreview?.[0];
    expect(dryRunPreview?.steps.length).toBeGreaterThan(0);
    expect(
      dryRunPreview?.steps.some((step) => step.resourceIds.length > 0),
    ).toBe(true);
    const commit = left.events.find((event) => event.kind === "COMMIT");
    expect(commit?.payload).toMatchObject({
      reservationPreview: [{ routeId: "N_S1_STRAIGHT" }],
    });
    expect(left.events.some((event) => event.kind === "DECISION_START")).toBe(
      true,
    );
    expect(cycle.promptTokens).toBe(0);
    expect(cycle.completionTokens).toBe(0);
  });

  it("stamps a vehicle score and the balance onto the recorded frame", () => {
    const network = createRoadNetwork();
    const engine = new SimulationEngine({ network, seed: 1 });
    const recorder = new ReplayRecorder({
      network,
      identity: {
        model: "test-model",
        testDate: "2026-09-21",
        postfix: "000001",
      },
      model: "test-model",
      seed: 1,
      tickDurationMs: 100,
      warmupTicks: 0,
    });
    const vehicle = engine.spawnVehicle("N_S1_STRAIGHT", "SEDAN");
    if (vehicle === undefined) {
      throw new Error("expected a sedan");
    }
    recorder.recordFrame(engine.currentTick, engine.vehicles.values(), [], "tick", {
      financialBalance: -1.25,
      scores: new Map([
        [vehicle.id, { score: -0.06, scorePhase: "charging" }],
      ]),
    });
    const frame = recorder.finalize().frames[0];
    expect(frame?.financialBalance).toBe(-1.25);
    expect(frame?.vehicles[0]).toMatchObject({
      id: vehicle.id,
      score: -0.06,
      scorePhase: "charging",
    });
  });

  it("keeps pedestrian audit events and omits cleared pedestrians from frames", () => {
    const network = createRoadNetwork();
    const engine = new SimulationEngine({ network, seed: 9 });
    const recorder = new ReplayRecorder({
      network,
      identity: {
        model: "test-model",
        testDate: "2026-09-26",
        postfix: "000001",
      },
      model: "test-model",
      seed: 9,
      tickDurationMs: 100,
      warmupTicks: 0,
    });
    const pedestrian = engine.spawnScheduledPedestrian({
      id: "replay-pedestrian",
      tick: 0,
      slot: 0,
      crosswalkId: "CROSSWALK:NORTH",
      direction: "A_TO_B",
    });
    for (
      let step = 0;
      pedestrian?.state === "APPROACHING" && step < 256;
      step += 1
    ) {
      engine.step();
    }
    expect(pedestrian?.state).toBe("WAITING");
    engine.grantPedestrianPhase("CROSSWALK:NORTH", ["A_TO_B"]);
    for (const event of engine.drainPedestrianEvents()) {
      recorder.recordWorldEvent(event.kind, event.tick, event);
    }
    for (
      let tick = 0;
      pedestrian?.state !== "CLEARED" && tick < 256;
      tick += 1
    ) {
      engine.step();
      for (const event of engine.drainPedestrianEvents()) {
        recorder.recordWorldEvent(event.kind, event.tick, event);
      }
    }
    recorder.recordWorldEvent("PED_JAYWALK", 17, {
      pedestrianIds: ["jaywalker"],
      crosswalkId: "CROSSWALK:EAST",
    });
    recorder.recordWorldEvent("PED_COLLISION", 18, {
      pedestrianIds: ["injured"],
      crosswalkId: "CROSSWALK:SOUTH",
    });
    recorder.recordFrame(
      18,
      engine.vehicles.values(),
      engine.pedestrians.values(),
      "tick",
    );

    const bundle = recorder.finalize();
    expect(bundle.events.map((event) => event.kind)).toEqual([
      "PED_SPAWN",
      "PED_GRANT",
      "PED_CLEAR",
      "PED_JAYWALK",
      "PED_COLLISION",
    ]);
    expect(bundle.frames[0]?.vehicles).toEqual([]);
    expect(bundle.frames[0]?.pedestrians).toEqual([]);
  });

  it("records authoritative pedestrian snapshots sorted by id", () => {
    const network = createRoadNetwork();
    const engine = new SimulationEngine({ network, seed: 9 });
    const recorder = new ReplayRecorder({
      network,
      identity: {
        model: "test-model",
        testDate: "2026-09-28",
        postfix: "pedestrians",
      },
      model: "test-model",
      seed: 9,
      tickDurationMs: 100,
      warmupTicks: 0,
    });
    engine.spawnScheduledPedestrian({
      id: "ped-b",
      tick: 1,
      slot: 0,
      crosswalkId: "CROSSWALK:NORTH",
      direction: "A_TO_B",
    });
    engine.spawnScheduledPedestrian({
      id: "ped-a",
      tick: 0,
      slot: 0,
      crosswalkId: "CROSSWALK:NORTH",
      direction: "A_TO_B",
    });

    recorder.recordFrame(
      engine.currentTick,
      engine.vehicles.values(),
      engine.pedestrians.values(),
      "tick",
      {
        pedestrianScores: new Map([
          ["ped-a", { score: -0.04, scorePhase: "charging" }],
        ]),
      },
    );

    expect(recorder.finalize().frames[0]?.pedestrians).toMatchObject([
      {
        id: "ped-a",
        state: "APPROACHING",
        waitingTicks: 0,
        crosswalkId: "CROSSWALK:NORTH",
        score: -0.04,
        scorePhase: "charging",
      },
      {
        id: "ped-b",
        state: "APPROACHING",
        waitingTicks: 0,
        crosswalkId: "CROSSWALK:NORTH",
      },
    ]);
  });

  it("records resolved explicit and lane-batch speed profiles for audit", () => {
    const network = createRoadNetwork();
    const engine = new SimulationEngine({
      network,
      dynamics: { stallModulus: 1_000_000 },
    });
    const explicit = engine.spawnVehicle("E_S1_STRAIGHT", "MOTORCYCLE");
    const batched = engine.spawnVehicle("W_S1_STRAIGHT", "MOTORCYCLE");
    if (explicit === undefined || batched === undefined) {
      throw new Error("expected speed-profile vehicles");
    }
    for (let tick = 0; tick < 30; tick += 1) {
      engine.step();
    }
    const laneBatches = [{
      laneId: batched.inboundLaneId,
      topN: 1,
      speedProfile: "SLOW_SLIDE" as const,
    }];
    const explicitProfiles = [{
      vehicleId: explicit.id,
      speedProfile: "BURST" as const,
    }];
    const dryRun = engine.dryRunSchedule(
      [explicit.id],
      laneBatches,
      [],
      undefined,
      explicitProfiles,
    );
    expect(dryRun.feasible).toBe(true);
    const observation = engine.buildObservation(0);
    const committed = engine.commitSchedule(
      [explicit.id],
      laneBatches,
      [],
      explicitProfiles,
    );
    expect(committed.committed).toBe(true);
    const toolArguments = {
      candidate_vehicle_ids: [explicit.id],
      vehicle_speed_profiles: [{
        vehicle_id: explicit.id,
        speed_profile: "BURST",
      }],
      lane_batches: [{
        lane_id: batched.inboundLaneId,
        top_n: 1,
        speed_profile: "SLOW_SLIDE",
      }],
    };
    const enterPlan = dryRun.admission.enterPlan?.map((entry) => ({
      vehicle_id: entry.vehicleId,
      lane_id: entry.laneId,
      enter_tick: entry.enterTick,
      scheduled: entry.scheduled,
      speed_profile: entry.speedProfile,
    })) ?? [];
    const recorder = new ReplayRecorder({
      network,
      identity: {
        model: "test-model",
        testDate: "2026-09-27",
        postfix: "speed",
      },
      model: "test-model",
      seed: 1,
      tickDurationMs: 100,
      warmupTicks: 0,
      slowStartSteps: engine.dynamics.slowStartSteps,
    });
    const result: AgentCycleResult = {
      commit: {
        admission: committed.admission,
        sleepTicks: 1,
        tacticalSummary: "Audit mixed speed profiles",
      },
      metrics: emptyMetrics,
      observation,
      usedFallback: false,
      trace: [
        {
          kind: "MODEL_RESPONSE",
          round: 1,
          data: {
            content: null,
            finishReason: "tool_calls",
            toolCalls: [
              {
                id: "dry-speed",
                type: "function",
                function: {
                  name: "dry_run_admit",
                  arguments: JSON.stringify(toolArguments),
                },
              },
              {
                id: "commit-speed",
                type: "function",
                function: {
                  name: "commit_schedule",
                  arguments: JSON.stringify({
                    admit_vehicle_ids: [explicit.id],
                    vehicle_speed_profiles:
                      toolArguments.vehicle_speed_profiles,
                    lane_batches: toolArguments.lane_batches,
                    sleep_ticks: 1,
                    tactical_summary: "Audit mixed speed profiles",
                  }),
                },
              },
            ],
          },
        },
        {
          kind: "TOOL_RESULT",
          round: 1,
          data: {
            toolCallId: "dry-speed",
            toolName: "dry_run_admit",
            output: {
              ok: true,
              resolved_vehicle_ids: [explicit.id, batched.id],
              enter_plan: enterPlan,
              vehicle_plans: [
                {
                  vehicle_id: explicit.id,
                  speed_profile: "BURST",
                  enter_tick: engine.currentTick,
                  scheduled: false,
                },
                {
                  vehicle_id: batched.id,
                  speed_profile: "SLOW_SLIDE",
                  enter_tick:
                    dryRun.admission.enterPlan?.[0]?.enterTick ??
                    engine.currentTick,
                  scheduled:
                    dryRun.admission.enterPlan?.[0]?.scheduled ?? false,
                },
              ],
            },
          },
        },
      ],
    };
    recorder.recordCycle(result, engine.vehicles, 0);
    const bundle = recorder.finalize();
    const dryEvent = bundle.events.find(
      (event) => event.kind === "DRY_RUN_ADMIT",
    );
    const dryPayload = dryEvent?.payload as {
      candidates: Array<{ vehicleId: string; speedProfile: string }>;
      lane_batches: unknown[];
      vehicle_speed_profiles: unknown[];
      reservationPreview: Array<{
        vehicleId: string;
        speedProfile: string;
        steps: unknown[];
      }>;
    };
    expect(dryPayload.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          vehicleId: explicit.id,
          speedProfile: "BURST",
        }),
        expect.objectContaining({
          vehicleId: batched.id,
          speedProfile: "SLOW_SLIDE",
        }),
      ]),
    );
    expect(dryPayload.vehicle_speed_profiles).toEqual(
      toolArguments.vehicle_speed_profiles,
    );
    expect(dryPayload.lane_batches).toEqual(toolArguments.lane_batches);
    const burst = dryPayload.reservationPreview.find(
      (preview) => preview.vehicleId === explicit.id,
    );
    const slow = dryPayload.reservationPreview.find(
      (preview) => preview.vehicleId === batched.id,
    );
    expect(burst?.speedProfile).toBe("BURST");
    expect(slow?.speedProfile).toBe("SLOW_SLIDE");
    expect(slow?.steps.length).toBeGreaterThan(burst?.steps.length ?? 0);

    const commit = bundle.events.find((event) => event.kind === "COMMIT");
    expect(commit?.payload).toMatchObject({
      vehicle_speed_profiles: toolArguments.vehicle_speed_profiles,
      lane_batches: toolArguments.lane_batches,
      vehiclePlans: expect.arrayContaining([
        expect.objectContaining({
          vehicleId: explicit.id,
          speedProfile: "BURST",
        }),
        expect.objectContaining({
          vehicleId: batched.id,
          speedProfile: "SLOW_SLIDE",
        }),
      ]),
      reservationPreview: expect.arrayContaining([
        expect.objectContaining({
          vehicleId: explicit.id,
          speedProfile: "BURST",
        }),
        expect.objectContaining({
          vehicleId: batched.id,
          speedProfile: "SLOW_SLIDE",
        }),
      ]),
    });
  });

  it("writes replay artifacts with the shared run identity", () => {
    const directory = mkdtempSync(join(tmpdir(), "silicon-replay-"));
    const store = createRunArtifactStore({
      directory,
      model: "deepseek-flash",
      testDate: "2026-09-21",
      postfix: "181500",
    });
    const path = writeReplayBundle(store, recordShortRun(3));
    expect(path).toBe(
      join(directory, "replay_deepseek-flash_2026-09-21_181500.json"),
    );
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    expect(parsed.schemaVersion).toBe(REPLAY_SCHEMA_VERSION);
    expect(parsed.frames.length).toBeGreaterThan(1);
  });
});

function firstVehicleId(
  bundle: ReturnType<ReplayRecorder["finalize"]>,
): string | undefined {
  return bundle.frames.flatMap((frame) => frame.vehicles)[0]?.id;
}
