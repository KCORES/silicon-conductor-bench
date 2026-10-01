import { describe, expect, it } from "vitest";
import { SimulationEngine } from "../src/core/engine.js";
import { createRoadNetwork } from "../src/core/network.js";
import {
  createReplayScene,
  headingFromDelta,
  lerpAngle,
  resolveConflictResourcePosition,
  resolveVehiclePose,
} from "../src/replay/geometry.js";

function advanceToStopline(engine: SimulationEngine): void {
  for (let tick = 0; tick < 30; tick += 1) {
    engine.step();
  }
}

describe("replay geometry", () => {
  it("places a northbound sedan on the inbound approach facing the intersection", () => {
    const network = createRoadNetwork();
    const engine = new SimulationEngine({ network });
    const scene = createReplayScene(network);
    const vehicle = engine.spawnVehicle("N_S1_STRAIGHT", "SEDAN");
    expect(vehicle).toBeDefined();
    if (vehicle === undefined) {
      return;
    }

    const spawned = resolveVehiclePose(vehicle, scene);
    expect(spawned.segments).toHaveLength(2);
    expect(spawned.z).toBeLessThan(-6);
    expect(spawned.heading).toBeCloseTo(headingFromDelta(0, 1));
    expect(spawned.segments[0]?.z).toBeGreaterThan(spawned.segments[1]?.z ?? 0);

    advanceToStopline(engine);
    const stopped = resolveVehiclePose(vehicle, scene);
    expect(stopped.state).toBe("AT_STOPLINE");
    expect(stopped.x).toBe(-3);
    expect(stopped.z).toBe(-7);
    expect(stopped.heading).toBeCloseTo(0);
  });

  it("follows the crossing trajectory and then the outbound axis", () => {
    const network = createRoadNetwork();
    const engine = new SimulationEngine({ network });
    const scene = createReplayScene(network);
    const vehicle = engine.spawnVehicle("N_S1_STRAIGHT", "SEDAN");
    expect(vehicle).toBeDefined();
    if (vehicle === undefined) {
      return;
    }
    advanceToStopline(engine);
    engine.applyAdmissions([vehicle.id]);

    expect(resolveVehiclePose(vehicle, scene).state).toBe("CROSSING");
    while (vehicle.state === "CROSSING") {
      const pose = resolveVehiclePose(vehicle, scene);
      expect(pose.x).toBe(-3);
      expect(pose.segments).toHaveLength(2);
      engine.step();
    }

    expect(vehicle.state).toBe("OUTBOUND");
    const outbound = resolveVehiclePose(vehicle, scene);
    expect(outbound.x).toBe(-3);
    expect(outbound.z).toBeGreaterThanOrEqual(6);
    expect(outbound.heading).toBeCloseTo(0);
  });

  it("keeps trajectory slots spatially continuous", () => {
    const network = createRoadNetwork();
    const scene = createReplayScene(network);
    for (const trajectory of scene.trajectories) {
      const source = network.trajectories.get(trajectory.id);
      expect(trajectory.slots.length).toBeGreaterThan(1);
      expect(
        trajectory.slots.map((slot) => ({
          slotKey: slot.slotKey,
          conflictResourceIds: slot.conflictResourceIds,
        })),
      ).toEqual(
        source?.slots.map((slot) => ({
          slotKey: slot.slotId,
          conflictResourceIds: [...slot.conflictResourceIds].sort(),
        })),
      );
      for (let index = 1; index < trajectory.slots.length; index += 1) {
        const previous = trajectory.slots[index - 1];
        const current = trajectory.slots[index];
        if (previous === undefined || current === undefined) {
          continue;
        }
        const distance = Math.max(
          Math.abs(current.x - previous.x),
          Math.abs(current.z - previous.z),
        );
        expect(distance).toBeLessThanOrEqual(1);
      }
    }
  });

  it("serializes sixteen unique lane anchors and connects every route endpoint", () => {
    const network = createRoadNetwork();
    const scene = createReplayScene(network);
    const inboundAnchors = scene.inboundLanes.map((lane) => {
      const anchor = lane.slots[lane.slots.length - 1];
      return `${anchor?.x}:${anchor?.z}`;
    });
    const outboundAnchors = scene.outboundLanes.map((lane) => {
      const anchor = lane.slots[0];
      return `${anchor?.x}:${anchor?.z}`;
    });
    expect(new Set(inboundAnchors).size).toBe(16);
    expect(new Set(outboundAnchors).size).toBe(16);

    for (const trajectory of scene.trajectories) {
      const networkTrajectory = network.trajectories.get(trajectory.id);
      const inbound = scene.inboundLanes.find(
        (lane) => lane.id === networkTrajectory?.inboundLaneId,
      );
      const outbound = scene.outboundLanes.find(
        (lane) => lane.id === networkTrajectory?.outboundLaneId,
      );
      expect(inbound).toBeDefined();
      expect(outbound).toBeDefined();
      const first = trajectory.slots[0];
      const inboundAnchor = inbound?.slots[inbound.slots.length - 1];
      const last = trajectory.slots[trajectory.slots.length - 1];
      const outboundAnchor = outbound?.slots[0];
      expect(first?.x).toBeCloseTo(inboundAnchor?.x ?? Number.NaN);
      expect(first?.z).toBeCloseTo(inboundAnchor?.z ?? Number.NaN);
      expect(last?.x).toBeCloseTo(outboundAnchor?.x ?? Number.NaN);
      expect(last?.z).toBeCloseTo(outboundAnchor?.z ?? Number.NaN);
    }
  });

  it("maps space and pairwise conflict resources to world coordinates", () => {
    const network = createRoadNetwork();
    const scene = createReplayScene(network);
    const spaceId = "SPACE:-3:-2";
    expect(resolveConflictResourcePosition(spaceId, scene)).toEqual({
      x: -3,
      z: -2,
    });

    const pairId = [...Object.keys(scene.conflictResources)].find((id) =>
      id.startsWith("PAIR:"),
    );
    expect(pairId).toBeDefined();
    if (pairId === undefined) {
      return;
    }
    const midpoint = scene.conflictResources[pairId];
    expect(midpoint).toBeDefined();
    expect(Number.isFinite(midpoint?.x)).toBe(true);
    expect(Number.isFinite(midpoint?.z)).toBe(true);
  });

  it("carries four shared crosswalk zones into replay geometry", () => {
    const scene = createReplayScene(createRoadNetwork());
    expect(scene.crosswalks).toHaveLength(4);
    expect(scene.crosswalks.map((crosswalk) => crosswalk.approach).sort()).toEqual(
      ["EAST", "NORTH", "SOUTH", "WEST"],
    );
    for (const crosswalk of scene.crosswalks) {
      expect(crosswalk.id).toBe(`CROSSWALK:${crosswalk.approach}`);
      expect(
        Math.hypot(
          crosswalk.end.x - crosswalk.start.x,
          crosswalk.end.z - crosswalk.start.z,
        ),
      ).toBeGreaterThan(6);
    }
  });

  it("interpolates headings across the 0/360 wrap with the shortest arc", () => {
    const almostFull = (359 * Math.PI) / 180;
    const oneDegree = Math.PI / 180;
    const forward = lerpAngle(almostFull, oneDegree, 0.5);
    const backward = lerpAngle(oneDegree, almostFull, 0.5);
    expect(Math.cos(forward)).toBeCloseTo(1, 2);
    expect(Math.cos(backward)).toBeCloseTo(1, 2);
    expect(Math.abs(forward - almostFull)).toBeLessThan(Math.PI / 2);
    expect(Math.abs(backward - oneDegree)).toBeLessThan(Math.PI / 2);
  });
});
