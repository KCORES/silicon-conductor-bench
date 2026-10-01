import { describe, expect, it } from "vitest";
import {
  ARROW_DISTANCE,
  CROSSWALK_DEPTH,
  CROSSWALK_DISTANCE,
  CROSSWALK_STRIPE_COUNT,
  LANE_BOUNDARY_OFFSETS,
  LANE_CENTER_OFFSETS,
  ROAD_CORNER_CENTER,
  ROAD_HALF_WIDTH,
  ROAD_WIDTH,
  SOLID_APPROACH_LENGTH,
  STOP_LINE_DISTANCE,
  createMainRoadMarkings,
  isPointOnMainRoad,
} from "../apps/replay/src/scene/mainRoadMarkings.js";
import { CITY_WORLD_EXTENT } from "../apps/replay/src/scene/city/cityConstants.js";
import { createRoadNetwork } from "../src/core/network.js";
import { createReplayScene } from "../src/replay/geometry.js";
import { crosswalkHalfCells } from "../apps/replay/src/scene/visualOccupancyGrid.js";

describe("main road markings", () => {
  const layout = createMainRoadMarkings(72);

  it("uses continuous double-yellow centerlines outside the intersection", () => {
    const centerlines = layout.rects.filter(
      (marking) => marking.kind === "centerline",
    );
    expect(centerlines).toHaveLength(8);
    expect(centerlines.every((marking) => marking.color === "yellow")).toBe(
      true,
    );
    const verticalOffsets = centerlines
      .filter((marking) => marking.depth > marking.width)
      .map((marking) => marking.x);
    const horizontalOffsets = centerlines
      .filter((marking) => marking.width > marking.depth)
      .map((marking) => marking.z);
    expect(new Set(verticalOffsets)).toEqual(new Set([-0.11, 0.11]));
    expect(new Set(horizontalOffsets)).toEqual(new Set([-0.11, 0.11]));
  });

  it("switches lane dividers to solid lines for the final three tiles", () => {
    const solids = layout.rects.filter(
      (marking) => marking.kind === "lane-solid",
    );
    expect(solids).toHaveLength(24);
    for (const marking of solids) {
      expect(Math.max(marking.width, marking.depth)).toBe(
        SOLID_APPROACH_LENGTH,
      );
    }
    const solidOuterDistance =
      STOP_LINE_DISTANCE + 0.12 + SOLID_APPROACH_LENGTH;
    const dashes = layout.rects.filter(
      (marking) => marking.kind === "lane-dash",
    );
    expect(
      dashes.every(
        (marking) =>
          Math.max(Math.abs(marking.x), Math.abs(marking.z)) >
          solidOuterDistance,
      ),
    ).toBe(true);
  });

  it("keeps every marking inside the city boundary", () => {
    const cityLayout = createMainRoadMarkings(CITY_WORLD_EXTENT);
    for (const marking of cityLayout.rects) {
      expect(Math.abs(marking.x) + marking.width / 2).toBeLessThanOrEqual(
        CITY_WORLD_EXTENT,
      );
      expect(Math.abs(marking.z) + marking.depth / 2).toBeLessThanOrEqual(
        CITY_WORLD_EXTENT,
      );
    }
  });

  it("orders solid guidance, stopline, and crosswalk from far to near", () => {
    const solidNearDistance = STOP_LINE_DISTANCE + 0.12;
    expect(solidNearDistance).toBeGreaterThan(STOP_LINE_DISTANCE);
    expect(STOP_LINE_DISTANCE).toBeGreaterThan(CROSSWALK_DISTANCE);
    expect(
      layout.rects.filter((marking) => marking.kind === "stopline"),
    ).toHaveLength(4);
    expect(
      layout.rects.filter((marking) => marking.kind === "crosswalk"),
    ).toHaveLength(CROSSWALK_STRIPE_COUNT * 4);
    const crosswalks = layout.rects.filter(
      (marking) => marking.kind === "crosswalk",
    );
    for (const marking of crosswalks) {
      if (Math.abs(marking.z) === CROSSWALK_DISTANCE) {
        expect(marking.depth).toBe(CROSSWALK_DEPTH);
        expect(marking.depth).toBeGreaterThan(marking.width);
      } else {
        expect(marking.width).toBe(CROSSWALK_DEPTH);
        expect(marking.width).toBeGreaterThan(marking.depth);
      }
    }
  });

  it("aligns the painted crosswalk footprint with authoritative X-Ray cells", () => {
    const scene = createReplayScene(createRoadNetwork());
    const cells = crosswalkHalfCells(scene).filter((cell) =>
      cell.conflictResourceId.startsWith("CROSSWALK:"),
    );
    for (const crosswalk of scene.crosswalks) {
      const source = cells.filter((cell) => cell.crosswalkId === crosswalk.id);
      expect(source).toHaveLength(16);
      const northSouth =
        crosswalk.approach === "NORTH" || crosswalk.approach === "SOUTH";
      const axisValues = source.flatMap((cell) =>
        cell.corners.map((corner) => northSouth ? corner.z : corner.x),
      );
      const center = (Math.min(...axisValues) + Math.max(...axisValues)) / 2;
      const depth = Math.max(...axisValues) - Math.min(...axisValues);
      const sign =
        crosswalk.approach === "NORTH" || crosswalk.approach === "WEST"
          ? -1
          : 1;
      expect(center).toBeCloseTo(sign * CROSSWALK_DISTANCE, 6);
      expect(depth).toBeCloseTo(CROSSWALK_DEPTH, 6);
    }
  });

  it("places right-straight-straight-left arrows from outer to inner", () => {
    expect(layout.arrows).toHaveLength(16);
    for (const approach of ["north", "east", "south", "west"] as const) {
      const arrows = layout.arrows.filter(
        (arrow) => arrow.approach === approach,
      );
      expect(arrows.map((arrow) => arrow.kind)).toEqual([
        "right",
        "straight",
        "straight",
        "left",
      ]);
      expect(
        arrows.every(
          (arrow) =>
            Math.max(Math.abs(arrow.x), Math.abs(arrow.z)) ===
            ARROW_DISTANCE,
        ),
      ).toBe(true);
    }
  });

  it("rotates arrows toward the intersection from all four sides", () => {
    expect(
      Object.fromEntries(
        layout.arrows
          .filter((_, index) => index % 4 === 0)
          .map((arrow) => [arrow.approach, arrow.heading]),
      ),
    ).toEqual({
      north: 0,
      south: Math.PI,
      east: -Math.PI / 2,
      west: Math.PI / 2,
    });
  });

  it("widens only the curb side of the outer lanes", () => {
    const outerBoundary = Math.max(...LANE_BOUNDARY_OFFSETS);
    const outerCenter = LANE_CENTER_OFFSETS[0] ?? 0;
    const innerLaneWidth =
      (LANE_CENTER_OFFSETS[0] ?? 0) - (LANE_CENTER_OFFSETS[1] ?? 0);
    expect(ROAD_WIDTH).toBe(ROAD_HALF_WIDTH * 2);
    expect(ROAD_HALF_WIDTH - outerBoundary).toBeGreaterThan(innerLaneWidth);
    expect(ROAD_HALF_WIDTH - outerCenter).toBeGreaterThan(1.3);
  });

  it("adds a rounded asphalt apron while retaining a sidewalk corner", () => {
    const diagonalApron = ROAD_HALF_WIDTH + 0.85;
    expect(isPointOnMainRoad(diagonalApron, diagonalApron)).toBe(true);
    expect(isPointOnMainRoad(ROAD_CORNER_CENTER, ROAD_CORNER_CENTER)).toBe(
      false,
    );
    expect(isPointOnMainRoad(ROAD_HALF_WIDTH - 0.01, 20)).toBe(true);
    expect(isPointOnMainRoad(ROAD_HALF_WIDTH + 0.2, 20)).toBe(false);
  });
});
