import { describe, expect, it } from "vitest";
import { withDerivedVehicleScores } from "../src/replay/derive-scores.js";
import type {
  ReplayBundle,
  ReplayFrame,
  ReplayScene,
  ReplayVehiclePose,
} from "../src/replay/types.js";

const scene: ReplayScene = {
  inboundLanes: [
    {
      id: "IN",
      kind: "INBOUND",
      slots: [
        { x: 0, z: 0, heading: 0 },
        { x: 1, z: 0, heading: 0 },
        { x: 2, z: 0, heading: 0 },
      ],
    },
  ],
  outboundLanes: [],
  trajectories: [],
  crosswalks: [],
  conflictResources: {},
};

describe("derived vehicle scores", () => {
  it("charges a queued vehicle and settles the exit toll on older replays", () => {
    const waiting = Array.from({ length: 12 }, (_, tick) =>
      poseFrame(tick, "QUEUED", 2),
    );
    const bundle = withDerivedVehicleScores(
      replay([
        ...waiting,
        poseFrame(11, "CROSSING", 3, "decision"),
        poseFrame(12, "OUTBOUND", 8),
      ], 0),
    );
    expect(bundle.frames[10]?.vehicles[0]?.score).toBeUndefined();
    expect(bundle.frames[11]?.vehicles[0]?.score).toBeCloseTo(-0.02);
    expect(bundle.frames[11]?.vehicles[0]?.scorePhase).toBe("charging");
    expect(bundle.frames[13]?.vehicles[0]?.score).toBeCloseTo(49.98);
    expect(bundle.frames[13]?.vehicles[0]?.scorePhase).toBe("settled");
  });

  it("settles an emergency vehicle with the emergency reward", () => {
    const waiting = Array.from({ length: 12 }, (_, tick) =>
      poseFrame(tick, "QUEUED", 2, "tick", "city-builder:car_police"),
    );
    const bundle = withDerivedVehicleScores(
      replay([
        ...waiting,
        poseFrame(11, "CROSSING", 3, "decision", "city-builder:car_police"),
        poseFrame(12, "OUTBOUND", 8, "tick", "city-builder:car_police"),
      ], 0),
    );
    expect(bundle.frames[13]?.vehicles[0]?.score).toBeCloseTo(99.85);
  });

  it("does not invent a bubble for a vehicle that was never charged", () => {
    const far = poseFrame(2, "APPROACHING", 0);
    const exited = poseFrame(3, "OUTBOUND", 8);
    const bundle = withDerivedVehicleScores(
      replay([poseFrame(1, "APPROACHING", 0, "decision"), far, exited], 1),
    );
    expect(bundle.frames[1]?.vehicles[0]?.score).toBeUndefined();
    expect(bundle.frames[2]?.vehicles[0]?.score).toBeUndefined();
  });

  it("leaves recorded scores in place", () => {
    const recorded = poseFrame(2, "QUEUED", 2);
    const vehicle = recorded.vehicles[0];
    if (vehicle === undefined) {
      throw new Error("missing pose");
    }
    const stamped: ReplayFrame = {
      ...recorded,
      vehicles: [{ ...vehicle, score: -1.5, scorePhase: "charging" }],
    };
    const bundle = withDerivedVehicleScores(replay([stamped]));
    expect(bundle.frames[0]?.vehicles[0]?.score).toBe(-1.5);
  });
});

function replay(frames: readonly ReplayFrame[], warmupTicks = 1): ReplayBundle {
  return {
    schemaVersion: 1,
    tickDurationMs: 100,
    warmupTicks,
    totalTicks: frames.at(-1)?.tick ?? 0,
    identity: { model: "test", testDate: "2026-09-23", postfix: "unit" },
    model: "test",
    seed: 1,
    scene,
    frames,
    events: [],
    cycles: [],
  };
}

function poseFrame(
  tick: number,
  state: ReplayVehiclePose["state"],
  x: number,
  phase: ReplayFrame["phase"] = "tick",
  type: ReplayVehiclePose["type"] = "SEDAN",
): ReplayFrame {
  const pose: ReplayVehiclePose = {
    id: "V1",
    type,
    state,
    routeId: "R",
    inboundLaneId: "IN",
    outboundLaneId: "OUT",
    waitingTicks: 1,
    x,
    z: 0,
    heading: 0,
    segments: [],
  };
  return { tick, phase, vehicles: [pose] };
}
