import type OpenAI from "openai";

export interface ChatSamplingOptions {
  readonly temperature?: number | undefined;
  readonly topP?: number | undefined;
  readonly topK?: number | undefined;
  readonly stream?: boolean | undefined;
  readonly thinkingType?: string | undefined;
}

export interface ChatSamplingRequestFields {
  readonly temperature?: number;
  readonly top_p?: number;
  readonly top_k?: number;
  readonly stream?: true;
  readonly stream_options?: { readonly include_usage: true };
  readonly thinking?: { readonly type: string };
}

/** Maps sampling config onto the chat-completions JSON body. */
export function samplingRequestFields(
  options: ChatSamplingOptions,
): ChatSamplingRequestFields {
  const thinkingType = options.thinkingType?.trim() ?? "";
  return {
    ...(options.temperature === undefined
      ? {}
      : { temperature: options.temperature }),
    ...(options.topP === undefined ? {} : { top_p: options.topP }),
    ...(options.topK === undefined ? {} : { top_k: options.topK }),
    ...(options.stream
      ? { stream: true as const, stream_options: { include_usage: true as const } }
      : {}),
    ...(thinkingType.length === 0 ? {} : { thinking: { type: thinkingType } }),
  };
}

export interface ChatStreamChunk {
  readonly id?: string | null;
  readonly model?: string | null;
  readonly created?: number | null;
  readonly usage?: OpenAI.Completions.CompletionUsage | null;
  readonly choices?: readonly {
    readonly finish_reason?: string | null;
    readonly delta?: {
      readonly content?: string | null;
      readonly reasoning?: string | null;
      readonly reasoning_content?: string | null;
      readonly tool_calls?: readonly (null | {
        readonly index?: number | null;
        readonly id?: string | null;
        readonly function?: null | {
          readonly name?: string | null;
          readonly arguments?: string | null;
        };
      })[];
    };
  }[];
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

interface PartialToolCall {
  id: string;
  name: string;
  arguments: string;
}

/** Folds SSE chunks into the non-streaming completion shape the runner already consumes. */
export function assembleStreamedChatCompletion(
  chunks: readonly ChatStreamChunk[],
): OpenAI.Chat.Completions.ChatCompletion {
  let id = "";
  let model = "";
  let created = 0;
  let content = "";
  let reasoning = "";
  let reasoningContent = "";
  let finishReason: OpenAI.Chat.Completions.ChatCompletion.Choice["finish_reason"] =
    "stop";
  let usage: OpenAI.Completions.CompletionUsage | undefined;
  const toolCalls = new Map<number, PartialToolCall>();

  for (const chunk of chunks) {
    const chunkId = textOf(chunk.id);
    if (chunkId.length > 0) {
      id = chunkId;
    }
    const chunkModel = textOf(chunk.model);
    if (chunkModel.length > 0) {
      model = chunkModel;
    }
    if (typeof chunk.created === "number") {
      created = chunk.created;
    }
    if (chunk.usage != null) {
      usage = chunk.usage;
    }
    const choice = chunk.choices?.[0];
    if (choice === undefined) {
      continue;
    }
    if (choice.finish_reason !== undefined && choice.finish_reason !== null) {
      finishReason = choice.finish_reason as OpenAI.Chat.Completions.ChatCompletion.Choice["finish_reason"];
    }
    const delta = choice.delta;
    if (delta === undefined) {
      continue;
    }
    if (typeof delta.content === "string") {
      content += delta.content;
    }
    if (typeof delta.reasoning === "string") {
      reasoning += delta.reasoning;
    }
    if (typeof delta.reasoning_content === "string") {
      reasoningContent += delta.reasoning_content;
    }
    for (const [offset, call] of (delta.tool_calls ?? []).entries()) {
      if (call == null) {
        continue;
      }
      const index = call.index ?? offset;
      const current = toolCalls.get(index) ?? {
        id: "",
        name: "",
        arguments: "",
      };
      const callId = textOf(call.id);
      if (callId.length > 0) {
        current.id = callId;
      }
      current.name += textOf(call.function?.name);
      current.arguments += textOf(call.function?.arguments);
      toolCalls.set(index, current);
    }
  }

  const assembledCalls = [...toolCalls.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, call]) => ({
      id: call.id,
      type: "function" as const,
      function: {
        name: call.name,
        arguments: call.arguments,
      },
    }));

  return {
    id,
    object: "chat.completion",
    created,
    model,
    choices: [
      {
        index: 0,
        logprobs: null,
        finish_reason: finishReason,
        message: {
          role: "assistant",
          content: content.length > 0 ? content : null,
          refusal: null,
          ...(assembledCalls.length === 0 ? {} : { tool_calls: assembledCalls }),
          ...(reasoning.length === 0 ? {} : { reasoning }),
          ...(reasoningContent.length === 0
            ? {}
            : { reasoning_content: reasoningContent }),
        },
      },
    ],
    ...(usage === undefined ? {} : { usage }),
  } as OpenAI.Chat.Completions.ChatCompletion;
}

export function isChatCompletionStream(
  value: unknown,
): value is AsyncIterable<ChatStreamChunk> {
  return (
    typeof value === "object" &&
    value !== null &&
    Symbol.asyncIterator in value
  );
}

export type ModelActivity = "thinking" | "output" | "tool_call";

function deltaHasToolCall(delta: NonNullable<ChatStreamChunk["choices"]>[number]["delta"]): boolean {
  return (delta?.tool_calls ?? []).some((call) => {
    if (call == null) {
      return false;
    }
    return (
      textOf(call.function?.name).length > 0 ||
      textOf(call.function?.arguments).length > 0 ||
      textOf(call.id).length > 0
    );
  });
}

/**
 * Approximate generated tokens when the provider never sends usage.
 * CJK and other non-Latin characters count as one token; Latin text counts as four characters per token.
 */
export function estimateTextTokens(text: string): number {
  let tokens = 0;
  for (const char of text) {
    if (/\s/u.test(char)) {
      continue;
    }
    const code = char.codePointAt(0) ?? 0;
    tokens += code > 0xff ? 1 : 0.25;
  }
  return Math.max(0, Math.round(tokens));
}

export function estimateGeneratedTokens(
  completion: OpenAI.Chat.Completions.ChatCompletion,
): number {
  const message = completion.choices[0]?.message as {
    readonly content?: string | null;
    readonly reasoning?: string | null;
    readonly reasoning_content?: string | null;
    readonly tool_calls?: readonly {
      readonly function?: {
        readonly name?: string | null;
        readonly arguments?: string | null;
      } | null;
    }[] | null;
  } | undefined;
  if (message == null) {
    return 0;
  }
  const parts = [
    message.content,
    message.reasoning,
    message.reasoning_content,
    ...(message.tool_calls ?? []).flatMap((call) => [
      call?.function?.name,
      call?.function?.arguments,
    ]),
  ];
  return estimateTextTokens(
    parts.filter((part): part is string => typeof part === "string").join(""),
  );
}

function withGeneratedUsage(
  completion: OpenAI.Chat.Completions.ChatCompletion,
): OpenAI.Chat.Completions.ChatCompletion {
  if ((completion.usage?.completion_tokens ?? 0) > 0) {
    return completion;
  }
  const tokens = estimateGeneratedTokens(completion);
  if (tokens <= 0) {
    return completion;
  }
  const promptTokens = completion.usage?.prompt_tokens ?? 0;
  return {
    ...completion,
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: tokens,
      total_tokens: promptTokens + tokens,
    },
  };
}

export const DECODE_WINDOW_MS = 10_000;

export type LiveStreamSample =
  | {
      readonly phase: "ttft";
      readonly ttftMs: number;
      readonly promptTokens: number;
      readonly prefillPerSec: number | null;
    }
  | {
      readonly phase: "decode";
      readonly windowDecodePerSec: number;
      readonly generatedTokens: number;
    };

export interface ChatCompletionLiveOptions {
  readonly promptTokensHint?: number;
  readonly onSample?: (sample: LiveStreamSample) => void;
  /** Starts the 10s decode window. The returned function cancels it. */
  readonly scheduleDecodeWindow?: (onTick: () => void) => () => void;
}

export function chunkGeneratedText(chunk: ChatStreamChunk): string {
  const delta = chunk.choices?.[0]?.delta;
  if (delta === undefined) {
    return "";
  }
  const parts: unknown[] = [
    delta.content,
    delta.reasoning,
    delta.reasoning_content,
  ];
  for (const call of delta.tool_calls ?? []) {
    if (call == null) {
      continue;
    }
    parts.push(call.function?.name, call.function?.arguments);
  }
  return parts.filter((part): part is string => typeof part === "string").join("");
}

export function estimatePromptTokens(value: unknown): number {
  try {
    return estimateTextTokens(JSON.stringify(value));
  } catch {
    return 0;
  }
}

function defaultScheduleDecodeWindow(onTick: () => void): () => void {
  const handle = setInterval(onTick, DECODE_WINDOW_MS);
  return () => {
    clearInterval(handle);
  };
}

/** A chunk counts as the first token when it carries text, reasoning, or a tool call. */
export function chatChunkHasToken(chunk: ChatStreamChunk): boolean {
  return chatChunkActivity(chunk) !== null;
}

/** Latest phase inside one chunk. Tool calls win over text, and text wins over reasoning. */
export function chatChunkActivity(chunk: ChatStreamChunk): ModelActivity | null {
  const delta = chunk.choices?.[0]?.delta;
  if (delta === undefined) {
    return null;
  }
  if (deltaHasToolCall(delta)) {
    return "tool_call";
  }
  if (typeof delta.content === "string" && delta.content.length > 0) {
    return "output";
  }
  if (
    (typeof delta.reasoning === "string" && delta.reasoning.length > 0) ||
    (typeof delta.reasoning_content === "string" && delta.reasoning_content.length > 0)
  ) {
    return "thinking";
  }
  return null;
}

export interface ChatCompletionResult {
  readonly completion: OpenAI.Chat.Completions.ChatCompletion;
  readonly ttftMs: number | null;
  /** Set when the stream ended before the provider closed it. The completion still holds chunks received so far. */
  readonly streamError: unknown | null;
}

export async function createChatCompletion(
  client: OpenAI,
  request: object,
  now: () => number = () => performance.now(),
  onActivity?: (activity: ModelActivity) => void,
  live?: ChatCompletionLiveOptions,
): Promise<ChatCompletionResult> {
  const startedAt = now();
  const created = await client.chat.completions.create(
    request as OpenAI.Chat.Completions.ChatCompletionCreateParams,
  );
  if (!isChatCompletionStream(created)) {
    return {
      completion: withGeneratedUsage(
        created as OpenAI.Chat.Completions.ChatCompletion,
      ),
      ttftMs: null,
      streamError: null,
    };
  }
  const chunks: ChatStreamChunk[] = [];
  let ttftMs: number | null = null;
  let activity: ModelActivity | null = null;
  let streamError: unknown = null;
  const promptTokens = live?.promptTokensHint ?? 0;
  const schedule = live?.scheduleDecodeWindow ?? defaultScheduleDecodeWindow;
  let generatedTokens = 0;
  let windowTokens = 0;
  let windowStartedAt: number | null = null;
  let cancelWindow: (() => void) | null = null;
  const emitSample = (sample: LiveStreamSample): void => {
    try {
      live?.onSample?.(sample);
    } catch {
      // A display callback must not abort the request.
    }
  };
  const flushDecodeWindow = (tail: boolean): void => {
    if (windowStartedAt === null) {
      return;
    }
    const elapsedMs = Math.max(0, now() - windowStartedAt);
    if (elapsedMs <= 0) {
      return;
    }
    if (!tail && elapsedMs < DECODE_WINDOW_MS) {
      return;
    }
    if (tail && windowTokens <= 0) {
      return;
    }
    emitSample({
      phase: "decode",
      windowDecodePerSec: windowTokens / (elapsedMs / 1000),
      generatedTokens,
    });
    windowTokens = 0;
    windowStartedAt = now();
  };
  try {
    for await (const chunk of created) {
      chunks.push(chunk);
      try {
        const tokens = estimateTextTokens(chunkGeneratedText(chunk));
        if (tokens > 0) {
          generatedTokens += tokens;
          windowTokens += tokens;
        }
        const next = chatChunkActivity(chunk);
        if (ttftMs === null && next !== null) {
          ttftMs = Math.max(0, Math.round(now() - startedAt));
          windowStartedAt = now();
          const ttftSeconds = ttftMs / 1000;
          emitSample({
            phase: "ttft",
            ttftMs,
            promptTokens,
            prefillPerSec:
              ttftSeconds > 0 && promptTokens > 0 ? promptTokens / ttftSeconds : null,
          });
          if (live?.onSample !== undefined) {
            cancelWindow = schedule(() => {
              flushDecodeWindow(false);
            });
          }
        }
        if (next !== null && next !== activity) {
          activity = next;
          onActivity?.(next);
        }
      } catch {
        // Keep the chunk. A bad field must not drop text already received.
      }
    }
  } catch (error) {
    streamError = error;
  } finally {
    cancelWindow?.();
    flushDecodeWindow(true);
  }
  return {
    completion: withGeneratedUsage(assembleStreamedChatCompletion(chunks)),
    ttftMs,
    streamError,
  };
}
