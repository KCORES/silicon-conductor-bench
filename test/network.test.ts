import { describe, expect, it } from "vitest";
import { createRoadNetwork, INTERSECTION_EDGE } from "../src/core/network.js";

describe("road network", () => {
  it("builds sixteen base trajectories plus sixteen guidance trajectories", () => {
    const network = createRoadNetwork();

    expect(network.inboundLanes.size).toBe(16);
    expect(network.outboundLanes.size).toBe(16);
    expect(network.trajectories.size).toBe(32);
  });

  it("gives every guidance trajectory the destination and exit of its intent route", () => {
    const network = createRoadNetwork();

    for (const trajectory of network.trajectories.values()) {
      if (trajectory.guidanceForRouteId === undefined) {
        continue;
      }
      const intent = network.trajectories.get(trajectory.guidanceForRouteId);
      expect(intent?.guidanceForRouteId).toBeUndefined();
      expect(trajectory.origin).toBe(intent?.origin);
      expect(trajectory.destination).toBe(intent?.destination);
      expect(trajectory.maneuver).toBe(intent?.maneuver);
      expect(trajectory.outboundLaneId).toBe(intent?.outboundLaneId);
      expect(trajectory.inboundLaneId).not.toBe(intent?.inboundLaneId);
    }
  });

  it("binds base and guidance trajectories to their expected inbound lanes", () => {
    const network = createRoadNetwork();

    for (const trajectory of network.trajectories.values()) {
      const lane = network.inboundLanes.get(trajectory.inboundLaneId);
      if (trajectory.guidanceForRouteId === undefined) {
        expect(lane?.routeId).toBe(trajectory.id);
        expect(trajectory.inboundLaneId).toBe(`IN_${trajectory.id}`);
      } else {
        const lanePrefix = trajectory.id.split("_GUIDED_")[0];
        expect(lane?.routeId?.startsWith(`${lanePrefix}_`)).toBe(true);
        expect(lane?.routeId).not.toBe(trajectory.guidanceForRouteId);
      }
      if (trajectory.id.endsWith("_LEFT")) {
        expect(trajectory.maneuver).toBe("LEFT");
      } else if (trajectory.id.endsWith("_RIGHT")) {
        expect(trajectory.maneuver).toBe("RIGHT");
      } else {
        expect(trajectory.maneuver).toBe("STRAIGHT");
      }
    }
  });

  it("keeps every trajectory spatially continuous", () => {
    const network = createRoadNetwork();

    for (const trajectory of network.trajectories.values()) {
      expect(trajectory.slots.length).toBeGreaterThan(1);
      for (let index = 1; index < trajectory.slots.length; index += 1) {
        const previous = trajectory.slots[index - 1];
        const current = trajectory.slots[index];
        expect(previous).toBeDefined();
        expect(current).toBeDefined();
        if (previous === undefined || current === undefined) {
          continue;
        }
        const distance = Math.max(
          Math.abs(current.x - previous.x),
          Math.abs(current.y - previous.y),
        );
        expect(distance).toBeLessThanOrEqual(1);
      }
    }
  });

  it("assigns pairwise conflict resources symmetrically", () => {
    const network = createRoadNetwork();
    const owners = new Map<string, string[]>();

    for (const trajectory of network.trajectories.values()) {
      for (const slot of trajectory.slots) {
        for (const resourceId of slot.conflictResourceIds) {
          if (!resourceId.startsWith("PAIR:")) {
            continue;
          }
          const existing = owners.get(resourceId) ?? [];
          existing.push(slot.slotId);
          owners.set(resourceId, existing);
        }
      }
    }

    expect(owners.size).toBeGreaterThan(0);
    for (const resourceOwners of owners.values()) {
      expect(resourceOwners).toHaveLength(2);
    }
  });

  it("maps every approach from outer right turn to inner left turn", () => {
    const network = createRoadNetwork();
    const expectedEntries: Record<string, readonly [number, number]> = {
      N_R1_RIGHT: [-4, -INTERSECTION_EDGE],
      N_S1_STRAIGHT: [-3, -INTERSECTION_EDGE],
      N_S2_STRAIGHT: [-2, -INTERSECTION_EDGE],
      N_L1_LEFT: [-1, -INTERSECTION_EDGE],
      S_L1_LEFT: [0, INTERSECTION_EDGE],
      S_S2_STRAIGHT: [1, INTERSECTION_EDGE],
      S_S1_STRAIGHT: [2, INTERSECTION_EDGE],
      S_R1_RIGHT: [3, INTERSECTION_EDGE],
      E_R1_RIGHT: [INTERSECTION_EDGE, -4],
      E_S1_STRAIGHT: [INTERSECTION_EDGE, -3],
      E_S2_STRAIGHT: [INTERSECTION_EDGE, -2],
      E_L1_LEFT: [INTERSECTION_EDGE, -1],
      W_L1_LEFT: [-INTERSECTION_EDGE, 0],
      W_S2_STRAIGHT: [-INTERSECTION_EDGE, 1],
      W_S1_STRAIGHT: [-INTERSECTION_EDGE, 2],
      W_R1_RIGHT: [-INTERSECTION_EDGE, 3],
    };

    for (const [routeId, [x, y]] of Object.entries(expectedEntries)) {
      expect(network.trajectories.get(routeId)?.slots[0]).toMatchObject({ x, y });
    }
  });

  it("gives every outbound lane one unambiguous physical anchor", () => {
    const network = createRoadNetwork();
    const anchors = [...network.outboundLanes.values()].map(
      (lane) => `${lane.anchor.x}:${lane.anchor.y}`,
    );
    expect(new Set(anchors).size).toBe(16);

    for (const trajectory of network.trajectories.values()) {
      const lane = network.outboundLanes.get(trajectory.outboundLaneId);
      const exit = trajectory.slots[trajectory.slots.length - 1];
      expect(lane).toBeDefined();
      expect(exit?.x).toBeCloseTo(lane?.anchor.x ?? Number.NaN);
      expect(exit?.y).toBeCloseTo(lane?.anchor.y ?? Number.NaN);
    }
  });

  it("keeps same-approach right turns clear of both straight paths", () => {
    const network = createRoadNetwork();
    for (const origin of ["N", "E", "S", "W"]) {
      const right = network.trajectories.get(`${origin}_R1_RIGHT`);
      const straights = [
        network.trajectories.get(`${origin}_S1_STRAIGHT`),
        network.trajectories.get(`${origin}_S2_STRAIGHT`),
      ];
      expect(right).toBeDefined();
      for (const straight of straights) {
        expect(straight).toBeDefined();
        const rightResources = new Set(
          right?.slots.flatMap((slot) => slot.conflictResourceIds) ?? [],
        );
        const shared = straight?.slots
          .flatMap((slot) => slot.conflictResourceIds)
          .filter((resourceId) => rightResources.has(resourceId));
        expect(shared).toEqual([]);
      }
    }
  });

  it("attaches each approach crosswalk only to its entry slots", () => {
    const network = createRoadNetwork();
    expect(network.crosswalks.size).toBe(4);
    for (const trajectory of network.trajectories.values()) {
      const expected = `CROSSWALK:${trajectory.origin}`;
      expect(trajectory.slots[0]?.controlResourceIds).toContain(expected);
      expect(trajectory.slots[1]?.controlResourceIds).toContain(expected);
      expect(
        trajectory.slots.slice(2).every(
          (slot) => !slot.controlResourceIds.includes(expected),
        ),
      ).toBe(true);
    }
  });
});
