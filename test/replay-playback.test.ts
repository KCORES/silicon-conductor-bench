import { describe, expect, it } from "vitest";
import {
  advancePlayback,
  beginScrub,
  createPlaybackState,
  endScrub,
  interpolateFramePedestrians,
  interpolateFrameVehicles,
  interpolateVehiclePose,
  normalizeReplayFrame,
  pause,
  pedestrianMotionTransitions,
  play,
  readFramePedestrians,
  scrubToTick,
  setAutoPauseOnDecision,
  setSpeed,
  shouldAutoPause,
  vehicleMotionTransitions,
} from "../src/replay/playback.js";
import type { PlaybackContext } from "../src/replay/playback.js";
import type {
  ReplayEvent,
  ReplayFrame,
  ReplayPedestrianPose,
  ReplayScorePhase,
  ReplayVehiclePose,
} from "../src/replay/types.js";

function event(
  id: string,
  kind: ReplayEvent["kind"],
  tick: number,
  sequence: number,
): ReplayEvent {
  return { id, kind, tick, sequence, payload: {} };
}

function frame(tick: number, phase: ReplayFrame["phase"] = "tick"): ReplayFrame {
  return { tick, phase, vehicles: [] };
}

function context(): PlaybackContext {
  return {
    tickDurationMs: 100,
    eventHoldMs: 50,
    frames: [
      frame(0),
      frame(10),
      frame(20, "decision"),
      frame(24),
      frame(30),
      frame(40),
      frame(50),
    ],
    events: [
      event("d1", "DECISION_START", 20, 0),
      event("dry1", "DRY_RUN_ADMIT", 20, 1),
      event("c1", "COMMIT", 20, 2),
      event("d2", "DECISION_START", 30, 3),
    ],
  };
}

describe("replay playback", () => {
  it("keeps playing through the first decision and holds the dry-run route", () => {
    const ctx = context();
    let state = play(createPlaybackState({ frameIndex: 1, eventCursor: -1 }));
    state = advancePlayback(state, 120, ctx);
    expect(state.playing).toBe(true);
    expect(state.pausedReason).not.toBe("decision");
    expect(ctx.events[state.eventCursor]?.id).toBe("dry1");
    expect(state.decisionVisualRemainingMs).toBeGreaterThan(0);
  });

  it("does not auto-pause when the switch is off", () => {
    const ctx = context();
    let state = play(
      setAutoPauseOnDecision(createPlaybackState({ frameIndex: 1 }), false),
    );
    state = advancePlayback(state, 300, ctx);
    expect(state.pausedReason).not.toBe("decision");
    expect(state.playing).toBe(true);
  });

  it("skips auto-pause while scrubbing and consumes crossed markers", () => {
    const ctx = context();
    const marker = ctx.events[0];
    const scrubbing = beginScrub(createPlaybackState());
    expect(shouldAutoPause(scrubbing, marker)).toBe(false);

    let state = scrubToTick(scrubbing, 24, ctx);
    state = endScrub(state, ctx);
    expect(state.consumedMarkerIds).toContain("d1");
    expect(shouldAutoPause(play(state), marker)).toBe(false);
  });

  it("skips auto-pause above 2x but still pauses at 2x", () => {
    const marker = event("d1", "DECISION_START", 20, 0);
    expect(
      shouldAutoPause(play(setSpeed(createPlaybackState(), 3)), marker),
    ).toBe(false);
    expect(
      shouldAutoPause(
        play(setAutoPauseOnDecision(setSpeed(createPlaybackState(), 2), true)),
        marker,
      ),
    ).toBe(true);
  });

  it("does not stop playback when a decision marker is crossed", () => {
    const ctx = context();
    let state = play(createPlaybackState({ frameIndex: 1 }));
    state = advancePlayback(state, 200, ctx);
    expect(state.pausedReason).not.toBe("decision");
    expect(state.playing).toBe(true);
    state = advancePlayback(state, 80, ctx);
    expect(state.playing).toBe(true);
  });

  it("keeps moving through spawn and despawn events", () => {
    const ctx: PlaybackContext = {
      tickDurationMs: 100,
      eventHoldMs: 700,
      frames: [frame(0), frame(1), frame(2)],
      events: [
        event("s0", "SPAWN", 0, 0),
        event("s1", "SPAWN", 0, 1),
        event("d0", "DESPAWN", 1, 2),
      ],
    };
    const state = advancePlayback(play(createPlaybackState()), 100, ctx);
    expect(state.playing).toBe(true);
    expect(state.frameIndex).toBe(1);
    expect(state.eventHoldElapsedMs).toBe(0);
  });

  it("plays a decision burst on the tick clock instead of freezing per event", () => {
    const ctx: PlaybackContext = {
      tickDurationMs: 100,
      eventHoldMs: 700,
      frames: [frame(0), frame(1), frame(2)],
      events: [
        event("start", "DECISION_START", 0, 0),
        event("dry", "DRY_RUN_ADMIT", 0, 1),
        event("tool", "TOOL_RESULT", 0, 2),
        event("commit", "COMMIT", 0, 3),
      ],
    };
    const moving = advancePlayback(play(createPlaybackState()), 100, ctx);
    expect(moving.playing).toBe(true);
    expect(moving.pausedReason).not.toBe("decision");
    expect(moving.frameIndex).toBe(1);
    expect(ctx.events[moving.eventCursor]?.id).toBe("dry");
    expect(moving.decisionVisualRemainingMs).toBe(600);
  });

  it("holds each dry-run route on screen while cars keep moving", () => {
    const ctx: PlaybackContext = {
      tickDurationMs: 100,
      eventHoldMs: 200,
      frames: [frame(0), frame(1), frame(2), frame(3), frame(4), frame(5)],
      events: [
        event("start", "DECISION_START", 0, 0),
        event("dry1", "DRY_RUN_ADMIT", 0, 1),
        event("dry2", "DRY_RUN_ADMIT", 0, 2),
        event("commit", "COMMIT", 0, 3),
      ],
    };
    const first = advancePlayback(play(createPlaybackState()), 40, ctx);
    expect(first.playing).toBe(true);
    expect(first.pausedReason).not.toBe("decision");
    expect(ctx.events[first.eventCursor]?.id).toBe("dry1");
    expect(first.frameIndex).toBe(0);

    const stillFirst = advancePlayback(first, 100, ctx);
    expect(stillFirst.playing).toBe(true);
    expect(ctx.events[stillFirst.eventCursor]?.id).toBe("dry1");

    const nextRoute = advancePlayback(stillFirst, 80, ctx);
    expect(nextRoute.playing).toBe(true);
    expect(ctx.events[nextRoute.eventCursor]?.id).toBe("dry2");
  });

  it("holds the committed route without stopping playback", () => {
    const ctx: PlaybackContext = {
      tickDurationMs: 100,
      eventHoldMs: 50,
      frames: [frame(0), frame(10), frame(20, "decision"), frame(24)],
      events: [
        event("d1", "DECISION_START", 20, 0),
        event("c1", "COMMIT", 20, 1),
      ],
    };
    const state = advancePlayback(
      play(createPlaybackState({ frameIndex: 1, eventCursor: -1 })),
      110,
      ctx,
    );
    expect(state.playing).toBe(true);
    expect(state.pausedReason).not.toBe("decision");
    expect(ctx.events[state.eventCursor]?.id).toBe("c1");
    expect(state.decisionVisualRemainingMs).toBeGreaterThan(0);
  });

  it("marks only natural tape exhaustion as complete", () => {
    const ctx = context();
    const completed = advancePlayback(
      play(createPlaybackState({ frameIndex: ctx.frames.length - 2 })),
      201,
      ctx,
    );
    expect(completed.playing).toBe(false);
    expect(completed.pausedReason).toBe("complete");
    expect(completed.frameIndex).toBe(ctx.frames.length - 1);

    const manual = pause(
      createPlaybackState({ frameIndex: ctx.frames.length - 1 }),
      "user",
    );
    expect(manual.pausedReason).toBe("user");
  });

  it("marks completion reached while holding a decision visual", () => {
    const ctx: PlaybackContext = {
      tickDurationMs: 100,
      eventHoldMs: 200,
      frames: [frame(0), frame(1)],
      events: [event("dry", "DRY_RUN_ADMIT", 1, 0)],
    };
    const completed = advancePlayback(
      play(
        createPlaybackState({
          frameIndex: 1,
          eventCursor: 0,
          decisionVisualRemainingMs: 100,
        }),
      ),
      10,
      ctx,
    );
    expect(completed.playing).toBe(false);
    expect(completed.pausedReason).toBe("complete");
  });

  it("keeps the departure frame score while interpolating toward the next pose", () => {
    const from = vehicleFrame(10, "charging", -0.42, 0);
    const to = vehicleFrame(11, "settled", 9.58, 4);
    const midway = interpolateFrameVehicles(from, to, 0.4);
    expect(midway).toHaveLength(1);
    expect(midway[0]?.score).toBe(-0.42);
    expect(midway[0]?.scorePhase).toBe("charging");
    expect(midway[0]?.x).toBeCloseTo(1.6);

    const arrived = interpolateFrameVehicles(from, to, 1);
    expect(arrived[0]?.score).toBe(9.58);
    expect(arrived[0]?.scorePhase).toBe("settled");
  });

  it("spreads a heavy vehicle half-speed move across both ticks", () => {
    const heavy = (
      tick: number,
      x: number,
      type: ReplayVehiclePose["type"] = "simplepoly-city:Bus",
      state: ReplayVehiclePose["state"] = "CROSSING",
    ): ReplayFrame => ({
      tick,
      phase: "tick",
      vehicles: [
        {
          id: "heavy",
          type,
          state,
          routeId: "N_L1_LEFT",
          inboundLaneId: "IN_N_L1_LEFT",
          outboundLaneId: "OUT_EAST_3",
          waitingTicks: 0,
          x,
          z: 0,
          heading: 0,
          segments: [{ x, z: 0, heading: 0 }],
        },
      ],
    });
    const frames = [heavy(0, 0), heavy(1, 0), heavy(2, 1)];
    const first = vehicleMotionTransitions(frames, 0, 0.5)[0];
    const second = vehicleMotionTransitions(frames, 1, 1.5)[0];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(
      first === undefined
        ? 0
        : interpolateVehiclePose(first.from, first.to, first.alpha).x,
    ).toBeCloseTo(0.25);
    expect(
      second === undefined
        ? 0
        : interpolateVehiclePose(second.from, second.to, second.alpha).x,
    ).toBeCloseTo(0.75);
    expect(
      vehicleMotionTransitions(
        [heavy(0, 0, "SEDAN"), heavy(1, 0, "SEDAN"), heavy(2, 1, "SEDAN")],
        0,
        0.5,
      ),
    ).toEqual([]);
    expect(
      vehicleMotionTransitions(
        [
          heavy(0, 0, "simplepoly-city:Bus", "ACCIDENT_STOPPED"),
          heavy(1, 0, "simplepoly-city:Bus", "ACCIDENT_STOPPED"),
          heavy(2, 1, "simplepoly-city:Bus", "ACCIDENT_STOPPED"),
        ],
        0,
        0.5,
      ),
    ).toEqual([]);
    expect(
      vehicleMotionTransitions(
        [heavy(0, 0), heavy(1, 0), heavy(2, 0), heavy(3, 1)],
        0,
        0.5,
      ),
    ).toEqual([]);
  });

  it("normalizes legacy frames without pedestrian snapshots", () => {
    const legacy = frame(1);
    expect(readFramePedestrians(legacy)).toEqual([]);
    expect(normalizeReplayFrame(legacy).pedestrians).toEqual([]);
  });

  it("interpolates existing pedestrians without early spawn or early clear", () => {
    const moving = pedestrian("moving", 0, "WAITING", 0);
    const spawned = pedestrian("spawned", 8, "CROSSING_RESERVED", Math.PI);
    const from: ReplayFrame = {
      tick: 1,
      phase: "tick",
      vehicles: [],
      pedestrians: [moving, pedestrian("clearing", 2, "INJURED", 0)],
    };
    const to: ReplayFrame = {
      tick: 2,
      phase: "tick",
      vehicles: [],
      pedestrians: [
        {
          ...moving,
          x: 4,
          heading: Math.PI,
          state: "CROSSING_RESERVED",
          row: 0,
          column: 0,
        },
        spawned,
      ],
    };

    const midway = interpolateFramePedestrians(from, to, 0.5);
    expect(midway.map((pose) => pose.id)).toEqual(["clearing", "moving"]);
    const movingMidway = midway.find((pose) => pose.id === "moving");
    expect(movingMidway).toMatchObject({
      x: 2,
      state: "WAITING",
    });
    expect(movingMidway).not.toHaveProperty("row");
    expect(movingMidway).not.toHaveProperty("column");
    expect(midway.find((pose) => pose.id === "clearing")?.state).toBe("INJURED");

    const arrived = interpolateFramePedestrians(from, to, 1);
    expect(arrived.map((pose) => pose.id)).toEqual(["moving", "spawned"]);
    expect(arrived[0]?.state).toBe("CROSSING_RESERVED");
  });

  it("reconstructs the same pedestrian view after forward and reverse seeks", () => {
    const frames: ReplayFrame[] = [
      {
        tick: 0,
        phase: "tick",
        vehicles: [],
        pedestrians: [pedestrian("seek-pedestrian", 0, "WAITING", 0)],
      },
      {
        tick: 4,
        phase: "tick",
        vehicles: [],
        pedestrians: [
          {
            ...pedestrian(
              "seek-pedestrian",
              4,
              "CROSSING_RESERVED",
              Math.PI / 2,
            ),
            row: 0,
            column: 2,
          },
        ],
      },
      {
        tick: 8,
        phase: "tick",
        vehicles: [],
        pedestrians: [],
      },
    ];
    const ctx: PlaybackContext = {
      frames,
      events: [],
      tickDurationMs: 100,
      eventHoldMs: 0,
    };
    const fromStart = scrubToTick(beginScrub(createPlaybackState()), 4, ctx);
    const fromEnd = scrubToTick(
      beginScrub(createPlaybackState({ frameIndex: 2 })),
      4,
      ctx,
    );

    expect(fromStart).toEqual(fromEnd);
    expect(
      interpolateFramePedestrians(
        frames[fromStart.frameIndex] ?? frames[0]!,
        frames[fromStart.frameIndex + 1],
        fromStart.alpha,
      ),
    ).toEqual([
      expect.objectContaining({
        id: "seek-pedestrian",
        state: "CROSSING_RESERVED",
        column: 2,
      }),
    ]);
  });

  it("spreads pedestrian movement continuously across the ticks for one cell", () => {
    const crossing = {
      ...pedestrian("moving", 0, "CROSSING_RESERVED", Math.PI / 2),
      row: 0 as const,
      column: 0,
    };
    const frames: ReplayFrame[] = Array.from({ length: 5 }, (_, tick) => ({
      tick,
      phase: "tick" as const,
      vehicles: [],
      pedestrians: [
        tick < 4
          ? crossing
          : {
              ...crossing,
              x: 1,
              column: 1,
            },
      ],
    }));

    expect(pedestrianMotionTransitions(frames, 1, 1)[0]?.alpha).toBeCloseTo(
      0.25,
    );
    expect(pedestrianMotionTransitions(frames, 2, 2)[0]?.alpha).toBeCloseTo(
      0.5,
    );
    expect(pedestrianMotionTransitions(frames, 3, 3)[0]?.alpha).toBeCloseTo(
      0.75,
    );
  });

  it("eases a waiting pedestrian toward the crosswalk over the same movement window", () => {
    const waiting = pedestrian("entering", 0, "WAITING", Math.PI / 2);
    const frames: ReplayFrame[] = Array.from({ length: 5 }, (_, tick) => ({
      tick,
      phase: "tick" as const,
      vehicles: [],
      pedestrians: [
        tick < 4
          ? waiting
          : {
              ...waiting,
              state: "CROSSING_RESERVED" as const,
              x: 1,
              row: 0 as const,
              column: 0,
            },
      ],
    }));

    const transition = pedestrianMotionTransitions(frames, 2, 2)[0];
    expect(transition).toMatchObject({
      id: "entering",
      alpha: 0.5,
      from: { state: "WAITING", x: 0 },
      to: { state: "CROSSING_RESERVED", x: 1 },
    });
  });

  it("does not animate a blocked pedestrian before the final movement window", () => {
    const crossing = {
      ...pedestrian("blocked", 0, "CROSSING_JAYWALK", Math.PI / 2),
      row: 0 as const,
      column: 0,
    };
    const frames: ReplayFrame[] = Array.from({ length: 13 }, (_, tick) => ({
      tick,
      phase: "tick" as const,
      vehicles: [],
      pedestrians: [
        tick < 12
          ? crossing
          : {
              ...crossing,
              x: 1,
              column: 1,
            },
      ],
    }));

    expect(pedestrianMotionTransitions(frames, 7, 7)[0]?.alpha).toBe(0);
    expect(pedestrianMotionTransitions(frames, 9, 9)[0]?.alpha).toBeCloseTo(
      0.25,
    );
  });
});

function vehicleFrame(
  tick: number,
  phase: ReplayScorePhase,
  score: number,
  x: number,
): ReplayFrame {
  const pose: ReplayVehiclePose = {
    id: "V1",
    type: "SEDAN",
    state: phase === "settled" ? "OUTBOUND" : "QUEUED",
    routeId: "N_S1_STRAIGHT",
    inboundLaneId: "IN_N_S1_STRAIGHT",
    outboundLaneId: "OUT_S_S1_STRAIGHT",
    waitingTicks: 0,
    x,
    z: 0,
    heading: 0,
    segments: [{ x, z: 0, heading: 0 }],
    score,
    scorePhase: phase,
  };
  return { tick, phase: "tick", vehicles: [pose] };
}

function pedestrian(
  id: string,
  x: number,
  state: ReplayPedestrianPose["state"],
  heading: number,
): ReplayPedestrianPose {
  return {
    id,
    crosswalkId: "CROSSWALK:NORTH",
    direction: "A_TO_B",
    state,
    waitingTicks: 3,
    patienceLimit: 20,
    x,
    z: 0,
    heading,
  };
}
