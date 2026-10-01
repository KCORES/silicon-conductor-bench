import { z } from "zod";
import type { TokenUsageInput } from "../metrics.js";

export class JevApiError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "JevApiError";
    this.status = status;
  }
}

export interface JevNoulQuestion {
  readonly type: "noul";
  readonly instructions: string;
  readonly criteria?: {
    readonly true: string;
    readonly false: string;
  };
}

export interface JevChoiceQuestion {
  readonly type: "choice";
  readonly instructions: string;
  readonly criteria: Readonly<Record<string, string | null>>;
}

export interface JevScoreQuestion {
  readonly type: "score";
  readonly instructions: string;
  readonly criteria: readonly string[];
}

export type JevQuestion = JevNoulQuestion | JevChoiceQuestion | JevScoreQuestion;

export interface JevNoulAnswer {
  readonly type: "noul";
  readonly noul: number;
}

export interface JevChoiceAnswer {
  readonly type: "choice";
  readonly choice: string;
  readonly confidence?: number | undefined;
  readonly probabilities?: Readonly<Record<string, number>> | undefined;
}

export interface JevScoreAnswer {
  readonly type: "score";
  readonly score: number;
  readonly confidence?: number | undefined;
}

export type JevAnswer = JevNoulAnswer | JevChoiceAnswer | JevScoreAnswer;

export interface JevUsage {
  readonly input_tokens?: number | undefined;
  readonly output_tokens?: number | undefined;
}

export interface JevEvaluation {
  readonly model: string;
  readonly answers: Readonly<Record<string, JevAnswer>>;
  readonly usage?: JevUsage | undefined;
}

export interface JevEvaluateRequest {
  readonly model: string;
  readonly state: unknown;
  readonly questions: Readonly<Record<string, JevQuestion>>;
}

export interface JevEvaluator {
  evaluate(request: JevEvaluateRequest): Promise<JevEvaluation>;
}

const answerSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("noul"),
    noul: z.number(),
  }),
  z.object({
    type: z.literal("choice"),
    choice: z.string(),
    confidence: z.number().optional(),
    probabilities: z.record(z.number()).optional(),
  }),
  z.object({
    type: z.literal("score"),
    score: z.number(),
    confidence: z.number().optional(),
  }),
]);

const evaluationSchema = z.object({
  model: z.string(),
  answers: z.record(answerSchema),
  usage: z
    .object({
      input_tokens: z.number().optional(),
      output_tokens: z.number().optional(),
    })
    .optional(),
});

export function jevSystemOneUrl(baseURL: string): string {
  const url = new URL(baseURL);
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = path.endsWith("/v1")
    ? `${path}/systemone`
    : `${path}/v1/systemone`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function jevUsageToTokenUsage(usage: JevUsage | undefined): TokenUsageInput {
  return {
    prompt_tokens: usage?.input_tokens ?? 0,
    completion_tokens: usage?.output_tokens ?? 0,
  };
}

export interface JevClientOptions {
  readonly apiKey: string;
  readonly baseURL: string;
  readonly model: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

export class JevClient implements JevEvaluator {
  constructor(private readonly options: JevClientOptions) {}

  async evaluate(request: JevEvaluateRequest): Promise<JevEvaluation> {
    const timeoutMs = this.options.timeoutMs ?? 30_000;
    let response: Response;
    try {
      response = await (this.options.fetchImpl ?? fetch)(
        jevSystemOneUrl(this.options.baseURL),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.options.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: request.model || this.options.model,
            state: request.state,
            questions: request.questions,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        },
      );
    } catch (error) {
      throw new JevApiError(
        error instanceof Error ? error.message : String(error),
      );
    }
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      throw new JevApiError(
        `Jev request failed with HTTP ${response.status}`,
        response.status,
      );
    }
    const parsed = evaluationSchema.safeParse(body);
    if (!parsed.success) {
      throw new JevApiError("Jev response did not match the System One schema");
    }
    return parsed.data;
  }
}
