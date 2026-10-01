import { describe, expect, it } from "vitest";
import {
  SCORE_BUBBLE_HOLD_MS,
  SCORE_BUBBLE_REFRESH_MS,
  presentScoreBubble,
  scoreBubblePaintDue,
} from "../src/replay/score-bubble.js";
import { cumulativeTokens, formatTokenTotal } from "../src/replay/run-stats.js";

describe("score bubbles", () => {
  it("stays hidden until a vehicle starts losing points", () => {
    expect(presentScoreBubble({}, undefined, 0).view).toEqual({ visible: false });
    expect(
      presentScoreBubble({ score: 0, scorePhase: "charging" }, undefined, 0).view,
    ).toEqual({ visible: false });
  });

  it("shakes when the orange total becomes more negative", () => {
    const first = presentScoreBubble(
      { score: -0.02, scorePhase: "charging" },
      undefined,
      0,
    );
    expect(first.view).toEqual({
      visible: true,
      text: "-0.020",
      tone: "charge",
      shake: true,
    });
    const held = presentScoreBubble(
      { score: -0.02, scorePhase: "charging" },
      first.memory,
      16,
    );
    expect(held.view).toMatchObject({ shake: false, tone: "charge" });
    const deeper = presentScoreBubble(
      { score: -0.04, scorePhase: "charging" },
      held.memory,
      32,
    );
    expect(deeper.view).toMatchObject({
      text: "-0.040",
      tone: "charge",
      shake: true,
    });
  });

  it("turns green or red at settlement and hides after three seconds", () => {
    const charging = presentScoreBubble(
      { score: -1.2, scorePhase: "charging" },
      undefined,
      0,
    );
    const gain = presentScoreBubble(
      { score: 8.8, scorePhase: "settled" },
      charging.memory,
      1_000,
    );
    expect(gain.view).toMatchObject({ tone: "gain", text: "8.800", shake: false });
    const still = presentScoreBubble(
      { score: 8.8, scorePhase: "settled" },
      gain.memory,
      1_000 + SCORE_BUBBLE_HOLD_MS - 1,
    );
    expect(still.view).toMatchObject({ visible: true, tone: "gain" });
    const gone = presentScoreBubble(
      { score: 8.8, scorePhase: "settled" },
      still.memory,
      1_000 + SCORE_BUBBLE_HOLD_MS,
    );
    expect(gone.view).toEqual({ visible: false });

    const loss = presentScoreBubble(
      { score: -2.5, scorePhase: "settled" },
      charging.memory,
      1_000,
    );
    expect(loss.view).toMatchObject({ tone: "loss", text: "-2.500" });
  });

  it("restores the orange bubble when playback returns to charging", () => {
    const charging = presentScoreBubble(
      { score: -0.4, scorePhase: "charging" },
      undefined,
      0,
    );
    const settled = presentScoreBubble(
      { score: 9.6, scorePhase: "settled" },
      charging.memory,
      500,
    );
    const hidden = presentScoreBubble(
      { score: 9.6, scorePhase: "settled" },
      settled.memory,
      500 + SCORE_BUBBLE_HOLD_MS,
    );
    expect(hidden.view.visible).toBe(false);
    const restored = presentScoreBubble(
      { score: -0.4, scorePhase: "charging" },
      hidden.memory,
      9_000,
    );
    expect(restored.view).toMatchObject({
      visible: true,
      tone: "charge",
      text: "-0.400",
      shake: false,
    });
    expect(restored.memory.settledAtMs).toBeNull();
  });
});

describe("score bubble refresh", () => {
  it("repaints a number at most once a second unless appearance changes", () => {
    expect(scoreBubblePaintDue(null, 0, false)).toBe(true);
    expect(scoreBubblePaintDue(0, SCORE_BUBBLE_REFRESH_MS - 1, false)).toBe(false);
    expect(scoreBubblePaintDue(0, SCORE_BUBBLE_REFRESH_MS, false)).toBe(true);
    expect(scoreBubblePaintDue(0, 10, true)).toBe(true);
  });
});

describe("run stats", () => {
  it("sums tokens from cycles that have already started", () => {
    const cycles = [
      { decisionTick: 10, promptTokens: 100, completionTokens: 20 },
      { decisionTick: 30, promptTokens: 50, completionTokens: 5 },
      { decisionTick: 40 },
    ];
    expect(cumulativeTokens(cycles, 9)).toBeNull();
    expect(cumulativeTokens(cycles, 10)).toBe(120);
    expect(cumulativeTokens(cycles, 30.5)).toBe(175);
    expect(formatTokenTotal(null)).toBe("--");
    expect(formatTokenTotal(1750)).toBe((1750).toLocaleString("en-US"));
  });
});
