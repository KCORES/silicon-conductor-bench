import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SimulationEngine } from "../dist/src/core/engine.js";
import { createRoadNetwork } from "../dist/src/core/network.js";
import { ReplayRecorder } from "../dist/src/replay/recorder.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const network = createRoadNetwork();
const engine = new SimulationEngine({ network, seed: 7 });
const recorder = new ReplayRecorder({
  network,
  identity: { model: "sample-fixture", testDate: "2026-09-21", postfix: "demo" },
  model: "sample-fixture",
  seed: 7,
  tickDurationMs: 100,
  warmupTicks: 16,
});

recorder.recordFrame(engine.currentTick, engine.vehicles.values(), "tick");
const spawned = [];
for (const routeId of ["N_S1_STRAIGHT", "E_S1_STRAIGHT", "S_R1_RIGHT", "W_S2_STRAIGHT"]) {
  const vehicle = engine.spawnVehicle(routeId, routeId.includes("R1") ? "MOTORCYCLE" : "SEDAN");
  if (vehicle !== undefined) {
    spawned.push(vehicle);
  }
}
recorder.recordSpawns(engine.currentTick, spawned);
for (let tick = 0; tick < 24; tick += 1) {
  const stepped = engine.step();
  recorder.recordDespawns(stepped.despawnEvents);
  recorder.recordFrame(engine.currentTick, engine.vehicles.values(), "tick");
}

const ready = [...engine.vehicles.values()].filter((vehicle) => vehicle.state === "AT_STOPLINE");
const first = ready[0];
const second = ready[1];
if (first === undefined) {
  throw new Error("expected a vehicle at the stopline");
}
const observation = engine.buildObservation(0);
const admission = engine.applyAdmissions(ready.slice(0, 2).map((vehicle) => vehicle.id));
const result = {
  commit: {
    admission,
    sleepTicks: 4,
    tacticalSummary: "Admit a conflict-checked pair and hold the remaining approaches.",
  },
  metrics: {
    apiCalls: 2,
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
    unverifiedCommits: 0,
    verifiedCommits: 1,
    protocolViolations: 0,
    warnings: [],
  },
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
            id: "call-1",
            type: "function",
            function: {
              name: "dry_run_admit",
              arguments: JSON.stringify({
                candidate_vehicle_ids: ready.map((vehicle) => vehicle.id),
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
        output: second === undefined
          ? { ok: true, reward: 10 }
          : { ok: false, at: 2, conflict: "SPACE:0:0", vs: [first.id, second.id] },
      },
    },
  ],
};

recorder.recordCycle(result, engine.vehicles, 12.5);
recorder.recordFrame(engine.currentTick, engine.vehicles.values(), "decision");
for (let step = 0; step < 8; step += 1) {
  const stepped = engine.step();
  recorder.recordDespawns(stepped.despawnEvents);
  recorder.recordFrame(engine.currentTick, engine.vehicles.values(), "tick");
}

const destination = join(root, "apps", "replay", "public", "sample-replay.json");
mkdirSync(dirname(destination), { recursive: true });
writeFileSync(destination, `${JSON.stringify(recorder.finalize())}\n`);
console.log(destination);
