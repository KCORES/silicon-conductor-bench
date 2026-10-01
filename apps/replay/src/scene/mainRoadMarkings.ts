import { TILE_SIZE } from "./city/cityConstants.js";
import {
  CROSSWALK_SIM_DISTANCE,
  INTERSECTION_EDGE,
} from "../../../../src/core/network.js";

export type MarkingColor = "white" | "yellow";
export type MarkingKind =
  | "lane-dash"
  | "lane-solid"
  | "centerline"
  | "stopline"
  | "crosswalk";
export type Approach = "north" | "east" | "south" | "west";
export type LaneArrowKind = "left" | "straight" | "right";

export interface RectMarking {
  readonly kind: MarkingKind;
  readonly color: MarkingColor;
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
}

export interface LaneArrowMarking {
  readonly approach: Approach;
  readonly kind: LaneArrowKind;
  readonly x: number;
  readonly z: number;
  readonly heading: number;
}

export interface MainRoadMarkingLayout {
  readonly rects: readonly RectMarking[];
  readonly arrows: readonly LaneArrowMarking[];
}

export const STOP_LINE_DISTANCE = 8.45;
export const CONTROL_OUTWARD_SHIFT = STOP_LINE_DISTANCE - 7.45;
export const CROSSWALK_DISTANCE =
  (CROSSWALK_SIM_DISTANCE / INTERSECTION_EDGE) * STOP_LINE_DISTANCE;
export const CROSSWALK_DEPTH = STOP_LINE_DISTANCE / INTERSECTION_EDGE;
export const SOLID_APPROACH_LENGTH = 3 * TILE_SIZE;
export const ARROW_DISTANCE = STOP_LINE_DISTANCE + 2.45;
export const CROSSWALK_STRIPE_COUNT = 16;

/** Asphalt edge on a straight arm. Lane centers intentionally remain unchanged. */
export const ROAD_HALF_WIDTH = 6.4;
export const ROAD_WIDTH = ROAD_HALF_WIDTH * 2;
/** Radius of the setback that rounds each otherwise-square intersection corner. */
export const ROAD_CORNER_RADIUS = 3;
export const ROAD_CORNER_CENTER = ROAD_HALF_WIDTH + ROAD_CORNER_RADIUS;
const LANE_DASH_LENGTH = 1.65;
export const LANE_BOUNDARY_OFFSETS = [
  -4.3,
  -2.85,
  -1.42,
  1.42,
  2.85,
  4.3,
] as const;
export const LANE_CENTER_OFFSETS = [5.025, 3.575, 2.135, 0.71] as const;
const ARROW_KINDS: readonly LaneArrowKind[] = [
  "right",
  "straight",
  "straight",
  "left",
];

export function createMainRoadMarkings(
  worldExtent: number,
): MainRoadMarkingLayout {
  const rects: RectMarking[] = [];
  const arrows: LaneArrowMarking[] = [];
  addDoubleYellowLines(rects, worldExtent);
  addLaneSeparators(rects, worldExtent);
  addIntersectionControls(rects);
  addLaneArrows(arrows);
  return { rects, arrows };
}

/**
 * True when a ground point belongs to the widened cross-shaped road, including
 * the rounded turning apron at each intersection corner.
 */
export function isPointOnMainRoad(x: number, z: number): boolean {
  const absoluteX = Math.abs(x);
  const absoluteZ = Math.abs(z);
  if (absoluteX <= ROAD_HALF_WIDTH || absoluteZ <= ROAD_HALF_WIDTH) {
    return true;
  }
  if (
    absoluteX > ROAD_CORNER_CENTER ||
    absoluteZ > ROAD_CORNER_CENTER
  ) {
    return false;
  }
  return (
    Math.hypot(
      absoluteX - ROAD_CORNER_CENTER,
      absoluteZ - ROAD_CORNER_CENTER,
    ) >= ROAD_CORNER_RADIUS
  );
}

function addDoubleYellowLines(
  rects: RectMarking[],
  worldExtent: number,
): void {
  const start = STOP_LINE_DISTANCE + 0.12;
  const length = worldExtent - start;
  const center = start + length / 2;
  for (const sign of [-1, 1] as const) {
    for (const offset of [-0.11, 0.11] as const) {
      rects.push(
        {
          kind: "centerline",
          color: "yellow",
          x: offset,
          z: sign * center,
          width: 0.08,
          depth: length,
        },
        {
          kind: "centerline",
          color: "yellow",
          x: sign * center,
          z: offset,
          width: length,
          depth: 0.08,
        },
      );
    }
  }
}

function addLaneSeparators(
  rects: RectMarking[],
  worldExtent: number,
): void {
  const solidStart = STOP_LINE_DISTANCE + 0.12;
  const solidCenter = solidStart + SOLID_APPROACH_LENGTH / 2;
  const dashStart = solidStart + SOLID_APPROACH_LENGTH + 1;
  for (const offset of LANE_BOUNDARY_OFFSETS) {
    for (const sign of [-1, 1] as const) {
      rects.push(
        {
          kind: "lane-solid",
          color: "white",
          x: offset,
          z: sign * solidCenter,
          width: 0.07,
          depth: SOLID_APPROACH_LENGTH,
        },
        {
          kind: "lane-solid",
          color: "white",
          x: sign * solidCenter,
          z: offset,
          width: SOLID_APPROACH_LENGTH,
          depth: 0.07,
        },
      );
      for (
        let distance = dashStart;
        distance + LANE_DASH_LENGTH / 2 <= worldExtent;
        distance += 3.2
      ) {
        rects.push(
          {
            kind: "lane-dash",
            color: "white",
            x: offset,
            z: sign * distance,
            width: 0.07,
            depth: LANE_DASH_LENGTH,
          },
          {
            kind: "lane-dash",
            color: "white",
            x: sign * distance,
            z: offset,
            width: LANE_DASH_LENGTH,
            depth: 0.07,
          },
        );
      }
    }
  }
}

function addIntersectionControls(rects: RectMarking[]): void {
  const inboundCenter = ROAD_HALF_WIDTH / 2;
  const stopLineLength = ROAD_HALF_WIDTH - 0.25;
  for (const sign of [-1, 1] as const) {
    rects.push(
      {
        kind: "stopline",
        color: "white",
        x: sign * inboundCenter,
        z: sign * STOP_LINE_DISTANCE,
        width: stopLineLength,
        depth: 0.2,
      },
      {
        kind: "stopline",
        color: "white",
        x: sign * STOP_LINE_DISTANCE,
        z: -sign * inboundCenter,
        width: 0.2,
        depth: stopLineLength,
      },
    );
    for (
      let stripeIndex = 0;
      stripeIndex < CROSSWALK_STRIPE_COUNT;
      stripeIndex += 1
    ) {
      const stripe =
        -5 + (10 * stripeIndex) / (CROSSWALK_STRIPE_COUNT - 1);
      rects.push(
        {
          kind: "crosswalk",
          color: "white",
          x: stripe,
          z: sign * CROSSWALK_DISTANCE,
          width: 0.28,
          depth: CROSSWALK_DEPTH,
        },
        {
          kind: "crosswalk",
          color: "white",
          x: sign * CROSSWALK_DISTANCE,
          z: stripe,
          width: CROSSWALK_DEPTH,
          depth: 0.28,
        },
      );
    }
  }
}

function addLaneArrows(arrows: LaneArrowMarking[]): void {
  const approaches: ReadonlyArray<{
    readonly approach: Approach;
    readonly heading: number;
    readonly positions: readonly (readonly [number, number])[];
  }> = [
    {
      approach: "north",
      heading: 0,
      positions: LANE_CENTER_OFFSETS.map(
        (offset) => [-offset, -ARROW_DISTANCE] as const,
      ),
    },
    {
      approach: "south",
      heading: Math.PI,
      positions: LANE_CENTER_OFFSETS.map(
        (offset) => [offset, ARROW_DISTANCE] as const,
      ),
    },
    {
      approach: "east",
      heading: -Math.PI / 2,
      positions: LANE_CENTER_OFFSETS.map(
        (offset) => [ARROW_DISTANCE, -offset] as const,
      ),
    },
    {
      approach: "west",
      heading: Math.PI / 2,
      positions: LANE_CENTER_OFFSETS.map(
        (offset) => [-ARROW_DISTANCE, offset] as const,
      ),
    },
  ];
  for (const approach of approaches) {
    approach.positions.forEach(([x, z], index) => {
      arrows.push({
        approach: approach.approach,
        kind: ARROW_KINDS[index] ?? "straight",
        x,
        z,
        heading: approach.heading,
      });
    });
  }
}
