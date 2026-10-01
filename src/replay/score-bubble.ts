import type { ReplayScorePhase } from "./types.js";

export const SCORE_BUBBLE_HOLD_MS = 3000;
export const SCORE_BUBBLE_REFRESH_MS = 1000;

/** Numeric refreshes wait a second. Appear, hide, and color changes paint immediately. */
export function scoreBubblePaintDue(
  lastPaintedAtMs: number | null,
  nowMs: number,
  appearanceChanged: boolean,
): boolean {
  if (appearanceChanged || lastPaintedAtMs === null) {
    return true;
  }
  return nowMs - lastPaintedAtMs >= SCORE_BUBBLE_REFRESH_MS;
}

export type ScoreBubbleTone = "charge" | "gain" | "loss";

export interface ScoreBubbleInput {
  readonly score?: number;
  readonly scorePhase?: ReplayScorePhase;
}

export interface ScoreBubbleMemory {
  readonly phase: "hidden" | "charging" | "settled";
  readonly score: number;
  readonly settledAtMs: number | null;
}

export type ScoreBubbleView =
  | { readonly visible: false }
  | {
      readonly visible: true;
      readonly text: string;
      readonly tone: ScoreBubbleTone;
      readonly shake: boolean;
    };

export interface ScoreBubblePresentation {
  readonly view: ScoreBubbleView;
  readonly memory: ScoreBubbleMemory;
}

const HIDDEN_MEMORY: ScoreBubbleMemory = {
  phase: "hidden",
  score: 0,
  settledAtMs: null,
};

export function presentScoreBubble(
  input: ScoreBubbleInput,
  previous: ScoreBubbleMemory | undefined,
  nowMs: number,
): ScoreBubblePresentation {
  const prior = previous ?? HIDDEN_MEMORY;
  if (input.score === undefined || input.scorePhase === undefined) {
    return { view: { visible: false }, memory: HIDDEN_MEMORY };
  }
  if (input.scorePhase === "charging") {
    if (!(input.score < 0)) {
      return { view: { visible: false }, memory: HIDDEN_MEMORY };
    }
    const shake =
      prior.phase === "hidden" ||
      (prior.phase === "charging" && input.score < prior.score);
    return {
      view: {
        visible: true,
        text: input.score.toFixed(3),
        tone: "charge",
        shake,
      },
      memory: { phase: "charging", score: input.score, settledAtMs: null },
    };
  }
  const settledAtMs =
    prior.phase === "settled" && prior.settledAtMs !== null
      ? prior.settledAtMs
      : nowMs;
  if (nowMs - settledAtMs >= SCORE_BUBBLE_HOLD_MS) {
    return {
      view: { visible: false },
      memory: { phase: "settled", score: input.score, settledAtMs },
    };
  }
  return {
    view: {
      visible: true,
      text: input.score.toFixed(3),
      tone: input.score < 0 ? "loss" : "gain",
      shake: false,
    },
    memory: { phase: "settled", score: input.score, settledAtMs },
  };
}
