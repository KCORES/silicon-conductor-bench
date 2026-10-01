import { describe, expect, it } from "vitest";
import { CITY_WORLD_EXTENT } from "../apps/replay/src/scene/city/cityConstants.js";
import { STOP_LINE_DISTANCE } from "../apps/replay/src/scene/mainRoadMarkings.js";
import { distanceFromMapEdge, mapSimulationPose } from "../apps/replay/src/scene/roadFrame.js";
import { config } from "../src/config.js";
import { approachLaneLength } from "../src/core/approach-length.js";
import { createRoadNetwork, INTERSECTION_EDGE } from "../src/core/network.js";
import { createReplayScene } from "../src/replay/geometry.js";

describe("map-edge approach length", () => {
  const length = approachLaneLength(CITY_WORLD_EXTENT, STOP_LINE_DISTANCE);

  it("places the far cell just inside the painted map edge", () => {
    expect(length).toBe(61);
    const network = createRoadNetwork({
      inboundLaneLength: length,
      outboundLaneLength: length,
    });
    const scene = createReplayScene(network);
    const inbound = scene.inboundLanes.find((lane) => lane.direction === "NORTH");
    const outbound = scene.outboundLanes.find((lane) => lane.direction === "SOUTH");
    const farInbound = inbound?.slots[0];
    const stop = inbound?.slots[inbound.slots.length - 1];
    const farOutbound = outbound?.slots[outbound.slots.length - 1];
    expect(farInbound).toBeDefined();
    expect(stop).toBeDefined();
    expect(farOutbound).toBeDefined();
    if (farInbound === undefined || stop === undefined || farOutbound === undefined) {
      return;
    }

    expect(Math.max(Math.abs(stop.x), Math.abs(stop.z))).toBe(INTERSECTION_EDGE);
    for (const slot of [farInbound, farOutbound]) {
      const visual = mapSimulationPose(slot.x, slot.z, slot.heading);
      const inside = distanceFromMapEdge(visual.x, visual.z, CITY_WORLD_EXTENT);
      expect(inside).toBeGreaterThan(0);
      expect(inside).toBeLessThan(1);
    }
  });

  it("uses that length for the benchmark and keeps the short test network", () => {
    expect(config.simulation.inboundLaneLength).toBe(length);
    expect(config.simulation.outboundLaneLength).toBe(length);
    const fixture = createRoadNetwork();
    expect([...fixture.inboundLanes.values()][0]?.capacitySlots).toBe(24);
    expect([...fixture.outboundLanes.values()][0]?.capacitySlots).toBe(15);
  });
});
