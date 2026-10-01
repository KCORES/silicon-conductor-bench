import { describe, expect, it, vi } from "vitest";
import { CapturingAgentApiLogger } from "../src/agent/api-logger.js";
import {
  JevApiError,
  JevClient,
  jevSystemOneUrl,
  jevUsageToTokenUsage,
} from "../src/agent/jev/client.js";
import type { JevEvaluateRequest, JevEvaluation } from "../src/agent/jev/client.js";
import { createBaselineDecider } from "../src/agent/jev/baselines.js";
import { JevAgentRunner } from "../src/agent/jev/runner.js";
import { WorkingMemoryStack } from "../src/agent/working-memory.js";
import {
  detectModelProvider,
  resolveModelConnection,
} from "../src/config.js";
import { SimulationEngine } from "../src/core/engine.js";
import { createRoadNetwork } from "../src/core/network.js";

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

describe("Jev provider selection", () => {
  it("uses the gateway settings only when a gateway model is set", () => {
    expect(detectModelProvider("jev-latest", "https://api.openai.com/v1")).toBe("jev");
    expect(detectModelProvider("gpt-4.1", "https://api.typesafe.ai")).toBe("jev");
    expect(detectModelProvider("gpt-4.1", "https://api.openai.com/v1")).toBe("openai");

    expect(
      resolveModelConnection({
        openaiApiKey: "openai-key",
        openaiBaseURL: "https://api.openai.com/v1",
        openaiModel: "gpt-4.1",
        gatewayApiKey: "gateway-key",
        gatewayBaseURL: "https://api.typesafe.ai",
        gatewayModel: "",
      }),
    ).toMatchObject({
      provider: "openai",
      apiKey: "openai-key",
      model: "gpt-4.1",
    });
    expect(
      resolveModelConnection({
        openaiApiKey: "openai-key",
        openaiBaseURL: "https://api.openai.com/v1",
        openaiModel: "gpt-4.1",
        gatewayApiKey: "gateway-key",
        gatewayBaseURL: "https://api.typesafe.ai",
        gatewayModel: "jev-latest",
      }),
    ).toMatchObject({
      provider: "jev",
      apiKey: "gateway-key",
      baseURL: "https://api.typesafe.ai",
      model: "jev-latest",
    });
  });
});

describe("Jev client", () => {
  it("posts a System One request and maps token usage", () => {
    expect(jevSystemOneUrl("https://api.typesafe.ai")).toBe(
      "https://api.typesafe.ai/v1/systemone",
    );
    expect(jevSystemOneUrl("https://api.typesafe.ai/v1/")).toBe(
      "https://api.typesafe.ai/v1/systemone",
    );
    expect(jevUsageToTokenUsage({ input_tokens: 11, output_tokens: 4 })).toEqual({
      prompt_tokens: 11,
      completion_tokens: 4,
    });

    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer secret");
      const body = JSON.parse(String(init?.body)) as {
        model: string;
        questions: { sleep_ticks: { type: string } };
      };
      expect(body.model).toBe("jev-latest");
      expect(body.questions.sleep_ticks.type).toBe("score");
      return new Response(
        JSON.stringify({
          model: "jev-1.13.0",
          answers: {
            sleep_ticks: { type: "score", score: 1, confidence: 0.5 },
          },
          usage: { input_tokens: 11, output_tokens: 4 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const client = new JevClient({
      apiKey: "secret",
      baseURL: "https://api.typesafe.ai",
      model: "jev-latest",
      fetchImpl: fetchImpl as typeof fetch,
    });

    return expect(
      client.evaluate({
        model: "jev-latest",
        state: { currentTick: 1 },
        questions: {
          sleep_ticks: {
            type: "score",
            instructions: "How long should this cycle sleep?",
            criteria: ["1 tick", "2 ticks"],
          },
        },
      }),
    ).resolves.toMatchObject({
      model: "jev-1.13.0",
      usage: { input_tokens: 11, output_tokens: 4 },
    });
  });

  it("rejects an HTTP error without treating the body as answers", async () => {
    const client = new JevClient({
      apiKey: "secret",
      baseURL: "https://api.typesafe.ai",
      model: "jev-latest",
      fetchImpl: (async () =>
        new Response("nope", { status: 422 })) as typeof fetch,
    });

    await expect(
      client.evaluate({
        model: "jev-latest",
        state: "ticket",
        questions: {
          urgent: { type: "noul", instructions: "Is this urgent?" },
        },
      }),
    ).rejects.toBeInstanceOf(JevApiError);
  });
});

describe("Jev agent runner", () => {
  it("admits the selected straight approach through the existing tools", async () => {
    const engine = new SimulationEngine({
      network: createRoadNetwork(),
      dynamics: {
        stallModulus: 1_000_000,
        creepAfterWaitingTicks: 1_000,
      },
    });
    for (let index = 0; index < 2; index += 1) {
      engine.spawnVehicle("E_S1_STRAIGHT", "MOTORCYCLE");
      for (let tick = 0; tick < 3; tick += 1) {
        engine.step();
      }
    }
    advanceToStoplines(engine);
    const logger = new CapturingAgentApiLogger();
    const runner = new JevAgentRunner({
      client: {
        async evaluate(request: JevEvaluateRequest): Promise<JevEvaluation> {
          const answers: Record<string, JevEvaluation["answers"][string]> = {};
          for (const [key, question] of Object.entries(request.questions)) {
            if (question.type !== "choice") {
              continue;
            }
            const preferred =
              Object.keys(question.criteria).find((option) =>
                ["EW_STRAIGHT", "SHORT_WAVE", "MEDIUM", "IGNORE"].includes(option),
              ) ?? Object.keys(question.criteria)[0] ?? "HOLD";
            answers[key] = { type: "choice", choice: preferred, confidence: 0.9 };
          }
          return {
            model: "jev-1.13.0",
            answers,
            usage: { input_tokens: 120, output_tokens: 8 },
          };
        },
      },
      engine,
      memory: new WorkingMemoryStack(),
      model: "jev-latest",
      economy,
      tollMotorcycle: 20,
      tollStandard: 50,
      tollEmergency: 100,
      logger,
    });

    const result = await runner.runCycle({ financialBalance: 0 });

    expect(result.usedFallback).toBe(false);
    expect(result.commit.admission.admittedVehicleIds.length).toBeGreaterThan(0);
    expect(result.commit.sleepTicks).toBe(5);
    expect(result.commit.tacticalSummary).toBe("jev phase=EW_STRAIGHT top_n=3 sleep=5");
    expect(result.metrics.apiCalls).toBe(1);
    expect(result.metrics.promptTokens).toBe(120);
    expect(result.metrics.completionTokens).toBe(8);
    expect(result.metrics.nonTerminalToolCalls).toBe(1);
    expect(logger.records.map((record) => record.event)).toEqual([
      "API_REQUEST",
      "API_RESPONSE",
      "TOOL_CALL",
      "TOOL_RESULT",
      "TOOL_CALL",
      "TOOL_RESULT",
    ]);
  });

  it("runs the longest-queue baseline without calling any API", async () => {
    const engine = new SimulationEngine({
      network: createRoadNetwork(),
      dynamics: {
        stallModulus: 1_000_000,
        creepAfterWaitingTicks: 1_000,
      },
    });
    engine.spawnVehicle("N_S1_STRAIGHT", "MOTORCYCLE");
    advanceToStoplines(engine);
    const logger = new CapturingAgentApiLogger();
    const runner = new JevAgentRunner({
      baseline: createBaselineDecider("longest-queue", 1),
      deciderName: "longest-queue",
      engine,
      memory: new WorkingMemoryStack(),
      model: "baseline-longest-queue",
      economy,
      tollMotorcycle: 20,
      tollStandard: 50,
      tollEmergency: 100,
      logger,
    });

    const result = await runner.runCycle({ financialBalance: 0 });

    expect(result.usedFallback).toBe(false);
    expect(result.commit.admission.admittedVehicleIds.length).toBe(1);
    expect(result.commit.tacticalSummary).toMatch(/^longest-queue phase=\S+ top_n=3 sleep=5$/);
    expect(result.metrics.apiCalls).toBe(0);
    expect(logger.records.map((record) => record.event)).not.toContain("API_REQUEST");
  });

  it("refreshes stale evacuation lanes after a rejected clearance order", async () => {
    const engine = new SimulationEngine({
      network: createRoadNetwork(),
      seed: 4,
      dynamics: { stallModulus: 1_000_000 },
    });
    const moving = engine.spawnVehicle("E_S1_STRAIGHT", "MOTORCYCLE");
    const entering = engine.spawnVehicle("N_S1_STRAIGHT", "MOTORCYCLE");
    advanceToStoplines(engine);
    engine.applyAdmissions([moving?.id ?? ""]);
    for (let wait = 0; wait < 24; wait += 1) {
      if (engine.dryRunAdmissions([entering?.id ?? ""]).conflictDetected !== undefined) {
        engine.applyAdmissions([entering?.id ?? ""]);
        break;
      }
      engine.step();
    }
    for (let tick = 0; tick < 50 && engine.step().interruptReason === undefined; tick += 1) {
      // advance until the crash interrupts
    }
    const incident = engine.incidentSummaries().find((item) => item.status === "OPEN");
    expect(incident?.suggestedEvacLanes.length).toBeGreaterThan(0);
    const runner = new JevAgentRunner({
      baseline: createBaselineDecider("longest-queue", 1),
      deciderName: "longest-queue",
      engine,
      memory: new WorkingMemoryStack(),
      model: "baseline-longest-queue",
      economy,
      tollMotorcycle: 20,
      tollStandard: 50,
      tollEmergency: 100,
      logger: new CapturingAgentApiLogger(),
    });
    runner.restoreRunnerState({
      cycle: 0,
      recentCycles: [],
      pendingFeedback: [],
      incidents: [
        {
          id: incident?.id ?? "",
          fact: {
            incidentId: incident?.id ?? "",
            suggestedEvacLanes: ["OUT_NOWHERE_9"],
            severedLaneIds: [],
            lockedCrosswalkIds: [],
          },
          clearanceOrdered: false,
        },
      ],
    });
    const clearanceOutputs = (trace: readonly { kind: string; data: unknown }[]) =>
      trace
        .filter((event) => event.kind === "TOOL_RESULT")
        .map((event) => event.data as { toolName: string; output: { ok?: boolean; error?: string } })
        .filter((data) => data.toolName === "order_accident_clearance")
        .map((data) => data.output);

    const stale = await runner.runCycle({ financialBalance: 0 });
    expect(clearanceOutputs(stale.trace)).toEqual([
      expect.objectContaining({ ok: false, error: "UNKNOWN_EVAC_LANE" }),
    ]);

    const refreshed = await runner.runCycle({ financialBalance: 0 });
    expect(clearanceOutputs(refreshed.trace)).toEqual([
      expect.objectContaining({ ok: true, incident_id: incident?.id }),
    ]);
  });

  it("requires exactly one decider", () => {
    expect(
      () =>
        new JevAgentRunner({
          engine: new SimulationEngine({ network: createRoadNetwork() }),
          memory: new WorkingMemoryStack(),
          model: "none",
          economy,
          tollMotorcycle: 20,
          tollStandard: 50,
          tollEmergency: 100,
          logger: new CapturingAgentApiLogger(),
        }),
    ).toThrow(/exactly one/);
  });

  it("falls back to a one-tick hold when the API fails", async () => {
    const engine = new SimulationEngine({
      network: createRoadNetwork(),
      dynamics: { stallModulus: 1_000_000 },
    });
    const runner = new JevAgentRunner({
      client: {
        async evaluate(): Promise<JevEvaluation> {
          throw new JevApiError("timeout", 408);
        },
      },
      engine,
      memory: new WorkingMemoryStack(),
      model: "jev-latest",
      economy,
      tollMotorcycle: 20,
      tollStandard: 50,
      tollEmergency: 100,
      logger: new CapturingAgentApiLogger(),
    });

    const result = await runner.runCycle({ financialBalance: 10 });

    expect(result.usedFallback).toBe(true);
    expect(result.commit.sleepTicks).toBe(1);
    expect(result.commit.admission.admittedVehicleIds).toEqual([]);
    expect(result.commit.tacticalSummary).toBe("Safe fallback: no admissions");
    expect(result.metrics.apiCalls).toBe(1);
    expect(result.trace.some((event) => event.kind === "FALLBACK")).toBe(true);
  });
});
