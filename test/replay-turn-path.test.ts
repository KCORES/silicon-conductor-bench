import { describe, expect, it } from "vitest";
import { createRoadNetwork } from "../src/core/network.js";
import { createReplayScene } from "../src/replay/geometry.js";
import { mapSimulationPose } from "../apps/replay/src/scene/roadFrame.js";
import { isPointOnMainRoad } from "../apps/replay/src/scene/mainRoadMarkings.js";
import {
  constrainTurnProgresses,
  TurnPathIndex,
} from "../apps/replay/src/scene/turnPath.js";

const ORIGIN_HEADING: Record<string, number> = {
  N: 0,
  E: -Math.PI / 2,
  S: Math.PI,
  W: Math.PI / 2,
};

const EXIT_HEADING: Record<string, Record<"LEFT" | "RIGHT", number>> = {
  N: { LEFT: Math.PI / 2, RIGHT: -Math.PI / 2 },
  E: { LEFT: 0, RIGHT: Math.PI },
  S: { LEFT: -Math.PI / 2, RIGHT: Math.PI / 2 },
  W: { LEFT: Math.PI, RIGHT: 0 },
};

function expectAngle(actual: number, expected: number): void {
  expect(Math.abs(shortestDelta(actual, expected))).toBeLessThan(1e-3);
}

function shortestDelta(from: number, to: number): number {
  const twoPi = Math.PI * 2;
  let delta = ((to - from) % twoPi) + twoPi;
  delta = ((delta + Math.PI) % twoPi) - Math.PI;
  return delta;
}

describe("replay turn paths", () => {
  const scene = createReplayScene(createRoadNetwork());
  const paths = TurnPathIndex.fromScene(scene);

  it("leaves straight routes on the grid", () => {
    expect(paths.samplesFor("N_S1_STRAIGHT")).toBeUndefined();
    expect(paths.sampleSlot("E_S1_STRAIGHT", 6, -3)).toBeUndefined();
    const straight = scene.trajectories.find((item) => item.id === "N_S1_STRAIGHT");
    expect(straight?.slots[0]).toMatchObject({ x: -3, z: -7 });
  });

  it("anchors base and guided turns on the stop line and outbound center", () => {
    const turns = scene.trajectories.filter((item) =>
      item.id.endsWith("_LEFT") || item.id.endsWith("_RIGHT"),
    );
    expect(turns).toHaveLength(16);

    for (const trajectory of turns) {
      const samples = paths.samplesFor(trajectory.id);
      const entry = trajectory.slots[0];
      const exit = trajectory.slots[trajectory.slots.length - 1];
      const origin = trajectory.id[0];
      const maneuver = trajectory.id.endsWith("_LEFT") ? "LEFT" : "RIGHT";
      expect(samples).toBeDefined();
      expect(origin).toBeDefined();
      expect(entry).toBeDefined();
      expect(exit).toBeDefined();
      if (
        samples === undefined ||
        origin === undefined ||
        entry === undefined ||
        exit === undefined
      ) {
        continue;
      }

      const inboundHeading = ORIGIN_HEADING[origin] ?? 0;
      const outboundHeading = EXIT_HEADING[origin]?.[maneuver] ?? 0;
      const start = mapSimulationPose(entry.x, entry.z, inboundHeading);
      const finish = mapSimulationPose(exit.x, exit.z, outboundHeading);
      const first = samples[0];
      const last = samples[samples.length - 1];
      expect(samples).toHaveLength(trajectory.slots.length);
      expect(first?.x).toBeCloseTo(start.x, 4);
      expect(first?.z).toBeCloseTo(start.z, 4);
      expectAngle(first?.heading ?? 0, inboundHeading);
      expect(last?.x).toBeCloseTo(finish.x, 4);
      expect(last?.z).toBeCloseTo(finish.z, 4);
      expectAngle(last?.heading ?? 0, outboundHeading);

      const lengths: number[] = [];
      let turned = 0;
      for (let index = 1; index < samples.length; index += 1) {
        const previous = samples[index - 1];
        const current = samples[index];
        if (previous === undefined || current === undefined) {
          continue;
        }
        lengths.push(
          Math.hypot(current.x - previous.x, current.z - previous.z),
        );
        const step = shortestDelta(previous.heading, current.heading);
        turned += step;
        expect(Math.abs(step)).toBeLessThan(Math.PI / 2);
      }
      const mean = lengths.reduce((sum, length) => sum + length, 0) / lengths.length;
      for (const length of lengths) {
        expect(Math.abs(length - mean) / mean).toBeLessThan(0.05);
      }
      const expectedTurn = maneuver === "LEFT" ? Math.PI / 2 : -Math.PI / 2;
      expect(turned).toBeCloseTo(expectedTurn, 2);
    }
  });

  it("walks arc length between slots and keeps conflict cells on the grid", () => {
    const trajectory = scene.trajectories.find((item) => item.id === "N_L1_LEFT");
    expect(trajectory).toBeDefined();
    if (trajectory === undefined) {
      return;
    }
    const middle = trajectory.slots[Math.floor(trajectory.slots.length / 2)];
    expect(middle).toBeDefined();
    if (middle === undefined) {
      return;
    }
    const visual = paths.sampleSlot("N_L1_LEFT", middle.x, middle.z);
    const grid = mapSimulationPose(middle.x, middle.z, middle.heading);
    expect(visual).toBeDefined();
    if (visual === undefined) {
      return;
    }
    expect(Math.hypot(visual.x - grid.x, visual.z - grid.z)).toBeGreaterThan(0.4);

    const entry = trajectory.slots[0];
    const second = trajectory.slots[1];
    expect(entry).toBeDefined();
    expect(second).toBeDefined();
    if (entry === undefined || second === undefined) {
      return;
    }
    const midway = paths.interpolate(
      { routeId: "N_L1_LEFT", x: entry.x, z: entry.z, heading: entry.heading },
      { routeId: "N_L1_LEFT", x: second.x, z: second.z, heading: second.heading },
      0.5,
    );
    const samples = paths.samplesFor("N_L1_LEFT");
    const first = samples?.[0];
    const next = samples?.[1];
    expect(midway).toBeDefined();
    expect(first).toBeDefined();
    expect(next).toBeDefined();
    if (midway === undefined || first === undefined || next === undefined) {
      return;
    }
    const into = Math.hypot(midway.x - first.x, midway.z - first.z);
    const remaining = Math.hypot(next.x - midway.x, next.z - midway.z);
    expect(into).toBeCloseTo(remaining, 1);
  });

  it("uses a quarter-circle right turn instead of pulling toward inner lanes", () => {
    const trajectory = scene.trajectories.find((item) => item.id === "N_R1_RIGHT");
    expect(trajectory).toBeDefined();
    if (trajectory === undefined) {
      return;
    }
    const middle = trajectory.slots[Math.floor(trajectory.slots.length / 2)];
    expect(middle).toBeDefined();
    if (middle === undefined) {
      return;
    }
    const pose = paths.sampleSlot(trajectory.id, middle.x, middle.z);
    expect(pose).toBeDefined();
    expect(Math.abs(pose?.x ?? 0)).toBeGreaterThan(5.7);
    expect(Math.abs(pose?.z ?? 0)).toBeGreaterThan(5.7);
    expect(Math.abs(Math.abs(pose?.x ?? 0) - Math.abs(pose?.z ?? 0))).toBeLessThan(
      1e-6,
    );
  });

  it("keeps a long rigid vehicle continuous across a turn", () => {
    const trajectory = scene.trajectories.find((item) => item.id === "N_R1_RIGHT");
    expect(trajectory).toBeDefined();
    if (trajectory === undefined) {
      return;
    }
    const poses = [];
    for (let slotIndex = 1; slotIndex < trajectory.slots.length; slotIndex += 1) {
      const from = trajectory.slots[slotIndex - 1];
      const to = trajectory.slots[slotIndex];
      if (from === undefined || to === undefined) {
        continue;
      }
      for (let step = 0; step < 10; step += 1) {
        const pose = paths.interpolateVehicle(
          { routeId: trajectory.id, ...from },
          { routeId: trajectory.id, ...to },
          step / 10,
          4.270708,
        );
        if (pose !== undefined) {
          poses.push(pose);
        }
      }
    }
    for (let index = 1; index < poses.length; index += 1) {
      const previous = poses[index - 1];
      const current = poses[index];
      if (previous === undefined || current === undefined) {
        continue;
      }
      expect(
        Math.hypot(current.x - previous.x, current.z - previous.z),
      ).toBeLessThan(0.35);
      expect(
        Math.abs(shortestDelta(previous.heading, current.heading)),
      ).toBeLessThan(0.12);
    }
  });

  it("cascades route-progress spacing without moving vehicles off path", () => {
    expect(
      constrainTurnProgresses(
        [
          { progress: 12, length: 4 },
          { progress: 10, length: 3 },
          { progress: 9, length: 2 },
        ],
        0.5,
      ),
    ).toEqual([12, 7.5, 4]);
  });

  it("keeps the longest vehicle swept envelope on the rounded road apron", () => {
    const halfLength = 4.270708 / 2;
    const halfWidth = 1.21125 / 2;
    const rightTurns = scene.trajectories.filter((item) =>
      item.id.endsWith("_RIGHT"),
    );
    expect(rightTurns).toHaveLength(8);
    for (const trajectory of rightTurns) {
      for (let index = 1; index < trajectory.slots.length; index += 1) {
        const from = trajectory.slots[index - 1];
        const to = trajectory.slots[index];
        if (from === undefined || to === undefined) {
          continue;
        }
        for (let step = 0; step <= 20; step += 1) {
          const pose = paths.interpolateVehicle(
            { routeId: trajectory.id, ...from },
            { routeId: trajectory.id, ...to },
            step / 20,
            halfLength * 2,
          );
          expect(pose).toBeDefined();
          if (pose === undefined) {
            continue;
          }
          const forward = {
            x: Math.sin(pose.heading),
            z: Math.cos(pose.heading),
          };
          const right = {
            x: Math.cos(pose.heading),
            z: -Math.sin(pose.heading),
          };
          for (const longitudinal of [-halfLength, halfLength]) {
            for (const lateral of [-halfWidth, halfWidth]) {
              expect(
                isPointOnMainRoad(
                  pose.x + forward.x * longitudinal + right.x * lateral,
                  pose.z + forward.z * longitudinal + right.z * lateral,
                ),
              ).toBe(true);
            }
          }
        }
      }
    }
  });
});
