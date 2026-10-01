import { describe, expect, it } from "vitest";
import { CITY_WORLD_EXTENT } from "../apps/replay/src/scene/city/cityConstants.js";
import { LANE_CENTER_OFFSETS, STOP_LINE_DISTANCE } from "../apps/replay/src/scene/mainRoadMarkings.js";
import {
  CROSSWALK_SIM_DISTANCE,
  createRoadNetwork,
  INTERSECTION_EDGE,
} from "../src/core/network.js";
import { createReplayScene } from "../src/replay/geometry.js";
import type { Direction } from "../src/core/types.js";
import {
  EDGE_FADE_SPAN,
  distanceFromMapEdge,
  edgeFadeOpacity,
  mapCrosswalkPoint,
  mapCrosswalkPose,
  mapSimulationPoint,
  mapSimulationPose,
  mapSimulationUnitSquare,
} from "../apps/replay/src/scene/roadFrame.js";

describe("replay road frame", () => {
  it("seats a north straight stop-line head on the painted lane", () => {
    const pose = mapSimulationPose(-3, -INTERSECTION_EDGE, 0);
    expect(pose.x).toBeCloseTo(-(LANE_CENTER_OFFSETS[1] ?? 0));
    expect(pose.z).toBeCloseTo(-STOP_LINE_DISTANCE);
    expect(pose.heading).toBeCloseTo(0);
  });

  it("keeps the north queue on that lane at simulation spacing", () => {
    const pose = mapSimulationPose(-3, -INTERSECTION_EDGE - 4, 0);
    expect(pose.x).toBeCloseTo(-(LANE_CENTER_OFFSETS[1] ?? 0));
    expect(pose.z).toBeCloseTo(-(STOP_LINE_DISTANCE + 4));
  });

  it("seats the east straight lane on the painted center", () => {
    const pose = mapSimulationPose(INTERSECTION_EDGE, -3, -Math.PI / 2);
    expect(pose.x).toBeCloseTo(STOP_LINE_DISTANCE);
    expect(pose.z).toBeCloseTo(-(LANE_CENTER_OFFSETS[1] ?? 0));
    expect(pose.heading).toBeCloseTo(-Math.PI / 2);
  });

  it("puts the south right lane on the opposite side of the centerline", () => {
    const pose = mapSimulationPose(3, INTERSECTION_EDGE, Math.PI);
    expect(pose.x).toBeCloseTo(LANE_CENTER_OFFSETS[0] ?? 0);
    expect(pose.z).toBeCloseTo(STOP_LINE_DISTANCE);
    expect(pose.heading).toBeCloseTo(Math.PI);
  });

  it("maps eight distinct simulation lanes to eight painted centers", () => {
    const expected = [
      -(LANE_CENTER_OFFSETS[0] ?? 0),
      -(LANE_CENTER_OFFSETS[1] ?? 0),
      -(LANE_CENTER_OFFSETS[2] ?? 0),
      -(LANE_CENTER_OFFSETS[3] ?? 0),
      LANE_CENTER_OFFSETS[3] ?? 0,
      LANE_CENTER_OFFSETS[2] ?? 0,
      LANE_CENTER_OFFSETS[1] ?? 0,
      LANE_CENTER_OFFSETS[0] ?? 0,
    ];
    for (let index = 0; index < expected.length; index += 1) {
      const simLane = index - 4;
      expect(mapSimulationPose(simLane, INTERSECTION_EDGE, Math.PI).x).toBeCloseTo(
        expected[index] ?? 0,
      );
    }
  });

  it("keeps every inbound and outbound lane on the correct side of the double yellow", () => {
    const scene = createReplayScene(createRoadNetwork());
    const inboundHeading: Record<Direction, number> = {
      NORTH: 0,
      EAST: -Math.PI / 2,
      SOUTH: Math.PI,
      WEST: Math.PI / 2,
    };
    const outboundHeading: Record<Direction, number> = {
      NORTH: Math.PI,
      EAST: Math.PI / 2,
      SOUTH: 0,
      WEST: -Math.PI / 2,
    };
    const inboundSign: Record<Direction, number> = {
      NORTH: -1,
      EAST: -1,
      SOUTH: 1,
      WEST: 1,
    };
    const outboundSign: Record<Direction, number> = {
      NORTH: 1,
      EAST: 1,
      SOUTH: -1,
      WEST: -1,
    };
    const centers = [...LANE_CENTER_OFFSETS];

    for (const lane of scene.inboundLanes) {
      const direction = lane.direction;
      const stopline = lane.slots[lane.slots.length - 1];
      expect(direction).toBeDefined();
      expect(stopline).toBeDefined();
      if (direction === undefined || stopline === undefined) {
        continue;
      }
      const mapped = mapSimulationPose(
        stopline.x,
        stopline.z,
        inboundHeading[direction],
      );
      const lateral =
        direction === "NORTH" || direction === "SOUTH" ? mapped.x : mapped.z;
      expect(Math.sign(lateral)).toBe(inboundSign[direction]);
      expect(
        centers.some((center) => Math.abs(Math.abs(lateral) - center) < 1e-6),
      ).toBe(true);
    }

    for (const lane of scene.outboundLanes) {
      const direction = lane.direction;
      const anchor = lane.slots[0];
      expect(direction).toBeDefined();
      expect(anchor).toBeDefined();
      if (direction === undefined || anchor === undefined) {
        continue;
      }
      const mapped = mapSimulationPose(
        anchor.x,
        anchor.z,
        outboundHeading[direction],
      );
      const lateral =
        direction === "NORTH" || direction === "SOUTH" ? mapped.x : mapped.z;
      expect(Math.sign(lateral)).toBe(outboundSign[direction]);
      expect(
        centers.some((center) => Math.abs(Math.abs(lateral) - center) < 1e-6),
      ).toBe(true);
    }
  });

  it("shares an edge between adjacent unit squares", () => {
    const left = mapSimulationUnitSquare(0, 0, 0);
    const right = mapSimulationUnitSquare(1, 0, 0);
    expect(left[1]).toEqual(right[0]);
    expect(left[2]).toEqual(right[3]);
  });

  it("keeps a northbound unit square centered on the mapped vehicle point", () => {
    const heading = 0;
    const center = mapSimulationPoint(-2.5, 0, heading);
    const corners = mapSimulationUnitSquare(-2.5, 0, heading);
    const average = {
      x: corners.reduce((sum, corner) => sum + corner.x, 0) / corners.length,
      z: corners.reduce((sum, corner) => sum + corner.z, 0) / corners.length,
    };
    expect(average.x).toBeCloseTo(center.x);
    expect(average.z).toBeCloseTo(center.z);
  });

  it("projects east crosswalk pedestrians onto the east road arm", () => {
    const x = CROSSWALK_SIM_DISTANCE;
    const z = -4;
    const point = mapCrosswalkPoint(x, z, "EAST");
    const pose = mapCrosswalkPose(x, z, 0, "EAST");
    expect(point.x).toBeCloseTo((x / INTERSECTION_EDGE) * STOP_LINE_DISTANCE);
    expect(point.z).toBeCloseTo(-(LANE_CENTER_OFFSETS[0] ?? 0));
    expect(pose.x).toBeCloseTo(point.x);
    expect(pose.z).toBeCloseTo(point.z);
    expect(pose.heading).toBeCloseTo(0);
  });

  it("fades vehicles only within six units of the map edge", () => {
    expect(edgeFadeOpacity(0)).toBe(0);
    expect(edgeFadeOpacity(EDGE_FADE_SPAN / 2)).toBeGreaterThan(0);
    expect(edgeFadeOpacity(EDGE_FADE_SPAN / 2)).toBeLessThan(1);
    expect(edgeFadeOpacity(EDGE_FADE_SPAN)).toBe(1);
    expect(edgeFadeOpacity(distanceFromMapEdge(0, 0, CITY_WORLD_EXTENT))).toBe(1);
  });
});
