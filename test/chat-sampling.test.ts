import OpenAI from "openai";
import { describe, expect, it } from "vitest";
import {
  assembleStreamedChatCompletion,
  chatChunkActivity,
  chatChunkHasToken,
  createChatCompletion,
  type LiveStreamSample,
  samplingRequestFields,
} from "../src/agent/chat-sampling.js";
import { CapturingAgentApiLogger, SilentAgentApiLogger } from "../src/agent/api-logger.js";
import { ToolCallAgentRunner } from "../src/agent/runner.js";
import { COMMIT_SCHEDULE } from "../src/agent/tools.js";
import { WorkingMemoryStack } from "../src/agent/working-memory.js";
import { SimulationEngine } from "../src/core/engine.js";
import { createRoadNetwork } from "../src/core/network.js";

describe("samplingRequestFields", () => {
  it("omits unset sampling fields", () => {
    expect(samplingRequestFields({})).toEqual({});
  });

  it("flattens extra sampling fields into the request body", () => {
    expect(
      samplingRequestFields({
        temperature: 0.6,
        topP: 1,
        topK: 20,
        stream: true,
        thinkingType: "enabled",
      }),
    ).toEqual({
      temperature: 0.6,
      top_p: 1,
      top_k: 20,
      stream: true,
      stream_options: { include_usage: true },
      thinking: { type: "enabled" },
    });
  });
});

describe("assembleStreamedChatCompletion", () => {
  it("joins content, reasoning, and split tool-call deltas", () => {
    const completion = assembleStreamedChatCompletion([
      {
        id: "chunk-1",
        model: "ling",
        created: 10,
        choices: [
          {
            delta: {
              reasoning_content: "check ",
              tool_calls: [
                {
                  index: 0,
                  id: "call-1",
                  function: { name: "commit_", arguments: "{\"sleep" },
                },
              ],
            },
          },
        ],
      },
      {
        choices: [
          {
            finish_reason: "tool_calls",
            delta: {
              reasoning_content: "queues",
              tool_calls: [
                {
                  index: 0,
                  function: { name: "schedule", arguments: "_ticks\":1}" },
                },
              ],
            },
          },
        ],
      },
      {
        usage: {
          prompt_tokens: 3,
          completion_tokens: 4,
          total_tokens: 7,
        },
      },
    ]);

    expect(completion.id).toBe("chunk-1");
    expect(completion.model).toBe("ling");
    expect(completion.usage).toEqual({
      prompt_tokens: 3,
      completion_tokens: 4,
      total_tokens: 7,
    });
    const message = completion.choices[0]?.message as {
      reasoning_content?: string;
      tool_calls?: { id: string; function: { name: string; arguments: string } }[];
    };
    expect(message.reasoning_content).toBe("check queues");
    expect(message.tool_calls?.[0]).toMatchObject({
      id: "call-1",
      type: "function",
      function: {
        name: "commit_schedule",
        arguments: "{\"sleep_ticks\":1}",
      },
    });
  });

  it("ignores null chunk fields instead of throwing", () => {
    const completion = assembleStreamedChatCompletion([
      {
        id: null,
        model: null,
        created: null,
        choices: [{ delta: { reasoning_content: "想" } }],
      },
      {
        choices: [{
          delta: {
            content: "走",
            tool_calls: [{
              id: null,
              function: { name: null, arguments: "{\"a\":1}" },
            }],
          },
        }],
      },
    ]);
    const message = completion.choices[0]?.message as {
      reasoning_content?: string;
      tool_calls?: { function: { arguments: string } }[];
    };
    expect(message.reasoning_content).toBe("想");
    expect(completion.choices[0]?.message.content).toBe("走");
    expect(message.tool_calls?.[0]?.function.arguments).toBe("{\"a\":1}");
  });
});

describe("chatChunkHasToken", () => {
  it("ignores a usage-only chunk and accepts the first text or tool delta", () => {
    expect(chatChunkHasToken({
      usage: { prompt_tokens: 3, completion_tokens: 0, total_tokens: 3 },
    })).toBe(false);
    expect(chatChunkHasToken({ choices: [{ delta: {} }] })).toBe(false);
    expect(chatChunkHasToken({
      choices: [{ delta: { reasoning_content: "check" } }],
    })).toBe(true);
    expect(chatChunkHasToken({
      choices: [{ delta: { tool_calls: [{ id: "call-1" }] } }],
    })).toBe(true);
  });

  it("measures TTFT from the first token chunk, not an earlier usage chunk", async () => {
    let time = 0;
    async function* stream() {
      time = 15;
      yield {
        choices: [{ delta: {} }],
        usage: { prompt_tokens: 1, completion_tokens: 0, total_tokens: 1 },
      };
      time = 40;
      yield { choices: [{ delta: { content: "go" } }] };
    }
    const client = {
      chat: {
        completions: {
          create: async () => stream(),
        },
      },
    } as unknown as OpenAI;
    const result = await createChatCompletion(client, {}, () => time);
    expect(result.ttftMs).toBe(40);
    expect(result.completion.choices[0]?.message.content).toBe("go");
  });

  it("reports thinking, output, and tool_call once each as the stream changes phase", async () => {
    const activities: string[] = [];
    async function* stream() {
      yield { choices: [{ delta: { reasoning_content: "a" } }] };
      yield { choices: [{ delta: { reasoning_content: "b" } }] };
      yield { choices: [{ delta: { content: "go" } }] };
      yield {
        choices: [{
          delta: {
            tool_calls: [{ id: "call-1", function: { name: "commit_schedule" } }],
          },
        }],
      };
    }
    const client = {
      chat: {
        completions: {
          create: async () => stream(),
        },
      },
    } as unknown as OpenAI;
    await createChatCompletion(client, {}, () => 0, (activity) => {
      activities.push(activity);
    });
    expect(chatChunkActivity({ choices: [{ delta: { content: "x" } }] })).toBe("output");
    expect(activities).toEqual(["thinking", "output", "tool_call"]);
  });
});

describe("createChatCompletion", () => {
  it("reads a streamed tool call back into a normal completion", async () => {
    const requests: unknown[] = [];
    async function* stream() {
      yield {
        id: "streamed",
        model: "ling",
        created: 1,
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "commit",
                  function: {
                    name: COMMIT_SCHEDULE,
                    arguments: JSON.stringify({
                      admit_vehicle_ids: [],
                      sleep_ticks: 1,
                      tactical_summary: "Streamed",
                    }),
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
        usage: {
          prompt_tokens: 8,
          completion_tokens: 2,
          total_tokens: 10,
        },
      };
    }
    const client = {
      chat: {
        completions: {
          create: async (request: unknown) => {
            requests.push(request);
            return stream();
          },
        },
      },
    } as unknown as OpenAI;
    const engine = new SimulationEngine({ network: createRoadNetwork() });
    const runner = new ToolCallAgentRunner({
      client,
      engine,
      memory: new WorkingMemoryStack(),
      model: "Ling_3_plus_yayi",
      maxTokens: 262144,
      temperature: 0.6,
      topP: 1,
      topK: 20,
      stream: true,
      thinkingType: "enabled",
      maxApiRounds: 2,
      maxToolCalls: 4,
      economy: {
        decisionTax: 0,
        toolTax: 0,
        recklessAttemptPenalty: 0,
        parallelTerminalWarningPenalty: 0,
      },
      tollMotorcycle: 0,
      tollStandard: 0,
      tollEmergency: 0,
      logger: new SilentAgentApiLogger(),
    });

    const result = await runner.runCycle({ financialBalance: 0 });

    expect(requests[0]).toMatchObject({
      model: "Ling_3_plus_yayi",
      max_tokens: 262144,
      temperature: 0.6,
      top_p: 1,
      top_k: 20,
      stream: true,
      stream_options: { include_usage: true },
      thinking: { type: "enabled" },
    });
    expect(result.usedFallback).toBe(false);
    expect(result.commit.sleepTicks).toBe(1);
    expect(result.metrics.promptTokens).toBe(8);
  });

  it("logs text already streamed and estimates decode tokens when the stream fails", async () => {
    let time = 0;
    async function* stream() {
      time = 2_000;
      yield { choices: [{ delta: { reasoning_content: "思考" } }] };
      time = 5_000;
      yield { choices: [{ delta: { content: "放行" } }] };
      throw new Error("socket hang up");
    }
    const client = {
      chat: {
        completions: {
          create: async () => stream(),
        },
      },
    } as unknown as OpenAI;
    const direct = await createChatCompletion(client, {}, () => time);
    expect(direct.streamError).toBeInstanceOf(Error);
    expect(direct.ttftMs).toBe(2_000);
    expect(direct.completion.choices[0]?.message.content).toBe("放行");
    expect(direct.completion.usage?.completion_tokens).toBe(4);

    const logger = new CapturingAgentApiLogger();
    const engine = new SimulationEngine({ network: createRoadNetwork() });
    const runner = new ToolCallAgentRunner({
      client,
      engine,
      memory: new WorkingMemoryStack(),
      model: "Ling_3_plus_yayi",
      maxTokens: 64,
      stream: true,
      maxApiRounds: 2,
      maxToolCalls: 1,
      economy: {
        decisionTax: 0,
        toolTax: 0,
        recklessAttemptPenalty: 0,
        parallelTerminalWarningPenalty: 0,
      },
      tollMotorcycle: 0,
      tollStandard: 0,
      tollEmergency: 0,
      logger,
    });
    const result = await runner.runCycle({ financialBalance: 0 });
    expect(result.usedFallback).toBe(true);
    expect(result.metrics.completionTokens).toBe(4);
    const error = logger.records.find((record) => record.event === "API_ERROR");
    expect(error?.payload).toMatchObject({
      message: "socket hang up",
      partial: {
        content: "放行",
        reasoning_content: "思考",
      },
    });
    const raw = logger.rawRecords.find((record) => record.event === "API_ERROR");
    expect(raw?.payload).toMatchObject({
      partial: {
        content: "放行",
        reasoning_content: "思考",
      },
    });
  });

  it("records the HTTP error body and surfaces it as the last error", async () => {
    const body = { message: "quota exceeded", type: "insufficient_quota" };
    const seen: string[] = [];
    const client = {
      chat: {
        completions: {
          create: async () => {
            const error = new Error("429 quota exceeded");
            Object.assign(error, { status: 429, error: body });
            throw error;
          },
        },
      },
    } as unknown as OpenAI;
    const logger = new CapturingAgentApiLogger();
    const engine = new SimulationEngine({ network: createRoadNetwork() });
    const runner = new ToolCallAgentRunner({
      client,
      engine,
      memory: new WorkingMemoryStack(),
      model: "Ling_3_plus_yayi",
      maxTokens: 64,
      maxApiRounds: 2,
      maxToolCalls: 1,
      economy: {
        decisionTax: 0,
        toolTax: 0,
        recklessAttemptPenalty: 0,
        parallelTerminalWarningPenalty: 0,
      },
      tollMotorcycle: 0,
      tollStandard: 0,
      tollEmergency: 0,
      logger,
      onError: (message) => {
        seen.push(message);
      },
    });
    const result = await runner.runCycle({ financialBalance: 0 });
    expect(result.usedFallback).toBe(true);
    expect(seen).toEqual([JSON.stringify(body)]);
    expect(logger.records.find((record) => record.event === "API_ERROR")?.payload).toMatchObject({
      status: 429,
      body,
    });
    expect(logger.rawRecords.find((record) => record.event === "API_ERROR")?.payload).toMatchObject({
      body,
    });
  });

  it("emits prefill at the first thinking token and decode on each 10s window", async () => {
    let time = 0;
    const clock = { tick: null as (() => void) | null };
    let releaseHold: (() => void) | undefined;
    const hold = new Promise<void>((resolve) => {
      releaseHold = resolve;
    });
    async function* stream() {
      time = 2_000;
      yield { choices: [{ delta: { reasoning_content: "思考思考" } }] };
      await hold;
    }
    const samples: LiveStreamSample[] = [];
    const client = {
      chat: { completions: { create: async () => stream() } },
    } as unknown as OpenAI;
    const pending = createChatCompletion(client, {}, () => time, undefined, {
      promptTokensHint: 1_000,
      onSample: (sample) => {
        samples.push(sample);
      },
      scheduleDecodeWindow: (onTick) => {
        clock.tick = onTick;
        return () => {
          clock.tick = null;
        };
      },
    });
    for (let attempt = 0; attempt < 20 && samples.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(samples[0]).toMatchObject({
      phase: "ttft",
      ttftMs: 2_000,
      promptTokens: 1_000,
      prefillPerSec: 500,
    });
    time = 12_000;
    clock.tick?.();
    const decode = samples[1];
    expect(decode?.phase).toBe("decode");
    if (decode?.phase === "decode") {
      expect(decode.generatedTokens).toBe(4);
      expect(decode.windowDecodePerSec).toBeCloseTo(0.4);
    }
    releaseHold?.();
    await pending;
  });

  it("writes max_tokens when a finished response was cut off", async () => {
    const seen: string[] = [];
    const client = {
      chat: {
        completions: {
          create: async () => ({
            id: "cut",
            model: "ling",
            choices: [{
              finish_reason: "length",
              message: { role: "assistant", content: "思考了一半" },
            }],
            usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 },
          }),
        },
      },
    } as unknown as OpenAI;
    const logger = new CapturingAgentApiLogger();
    const engine = new SimulationEngine({ network: createRoadNetwork() });
    const runner = new ToolCallAgentRunner({
      client,
      engine,
      memory: new WorkingMemoryStack(),
      model: "ling",
      maxTokens: 64,
      maxApiRounds: 2,
      maxToolCalls: 1,
      economy: {
        decisionTax: 0,
        toolTax: 0,
        recklessAttemptPenalty: 0,
        parallelTerminalWarningPenalty: 0,
      },
      tollMotorcycle: 0,
      tollStandard: 0,
      tollEmergency: 0,
      logger,
      onError: (message) => {
        seen.push(message);
      },
    });
    await runner.runCycle({ financialBalance: 0 });
    expect(seen[0]).toBe("max_tokens");
    expect(logger.records.find((record) => record.event === "API_RESPONSE")?.payload).toMatchObject({
      outcome: "max_tokens",
      finishReason: "length",
    });
  });

  it("writes timeout when the request times out and ok when a tool call is usable", async () => {
    const timeoutSeen: string[] = [];
    const timeoutError = new Error("Request timed out.");
    timeoutError.name = "APIConnectionTimeoutError";
    const timeoutClient = {
      chat: {
        completions: {
          create: async () => {
            throw timeoutError;
          },
        },
      },
    } as unknown as OpenAI;
    const engine = new SimulationEngine({ network: createRoadNetwork() });
    const economy = {
      decisionTax: 0,
      toolTax: 0,
      recklessAttemptPenalty: 0,
      parallelTerminalWarningPenalty: 0,
    };
    await new ToolCallAgentRunner({
      client: timeoutClient,
      engine,
      memory: new WorkingMemoryStack(),
      model: "ling",
      maxTokens: 64,
      maxApiRounds: 2,
      maxToolCalls: 1,
      economy,
      tollMotorcycle: 0,
      tollStandard: 0,
      tollEmergency: 0,
      logger: new CapturingAgentApiLogger(),
      onError: (message) => {
        timeoutSeen.push(message);
      },
    }).runCycle({ financialBalance: 0 });
    expect(timeoutSeen).toEqual(["timeout"]);

    const okSeen: string[] = [];
    const okClient = {
      chat: {
        completions: {
          create: async () => ({
            id: "ok",
            model: "ling",
            choices: [{
              finish_reason: "tool_calls",
              message: {
                role: "assistant",
                content: null,
                tool_calls: [{
                  id: "commit",
                  type: "function",
                  function: {
                    name: COMMIT_SCHEDULE,
                    arguments: JSON.stringify({
                      admit_vehicle_ids: [],
                      sleep_ticks: 1,
                      tactical_summary: "Go",
                    }),
                  },
                }],
              },
            }],
            usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
          }),
        },
      },
    } as unknown as OpenAI;
    const result = await new ToolCallAgentRunner({
      client: okClient,
      engine: new SimulationEngine({ network: createRoadNetwork() }),
      memory: new WorkingMemoryStack(),
      model: "ling",
      maxTokens: 64,
      maxApiRounds: 2,
      maxToolCalls: 1,
      economy,
      tollMotorcycle: 0,
      tollStandard: 0,
      tollEmergency: 0,
      logger: new CapturingAgentApiLogger(),
      onError: (message) => {
        okSeen.push(message);
      },
    }).runCycle({ financialBalance: 0 });
    expect(result.usedFallback).toBe(false);
    expect(okSeen).toEqual(["ok"]);
  });
});
