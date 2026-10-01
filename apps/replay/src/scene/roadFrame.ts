import { CITY_WORLD_EXTENT } from "./city/cityConstants.js";
import {
  LANE_CENTER_OFFSETS,
  STOP_LINE_DISTANCE,
} from "./mainRoadMarkings.js";
import { INTERSECTION_EDGE } from "../../../../src/core/network.js";
import type { Direction } from "../../../../src/core/types.js";

/** World units over which a replay vehicle fades in or out at the map edge. */
export const EDGE_FADE_SPAN = 6;

/** Simulation intersection edge. Entry anchors sit at ±this value. */
const SIM_BOX = INTERSECTION_EDGE;

const SIM_LANES = [-4, -3, -2, -1, 0, 1, 2, 3] as const;
const OUTER_LANE = LANE_CENTER_OFFSETS[0];
const MID_OUTER_LANE = LANE_CENTER_OFFSETS[1];
const MID_INNER_LANE = LANE_CENTER_OFFSETS[2];
const INNER_LANE = LANE_CENTER_OFFSETS[3];

export interface RoadPoint {
  readonly x: number;
  readonly z: number;
}

export interface RoadPose extends RoadPoint {
  readonly heading: number;
}

/**
 * Paint the simulation grid onto the visual road.
 * Lane centers in the engine are 1 unit apart; the painted lanes are wider
 * and the stop line sits outside the simulation box.
 */
export function mapSimulationPose(
  x: number,
  z: number,
  heading: number,
): RoadPose {
  const here = mapSimulationPoint(x, z, heading);
  const axisAligned =
    Math.min(Math.abs(Math.sin(heading)), Math.abs(Math.cos(heading))) < 0.2;
  if (axisAligned) {
    return { x: here.x, z: here.z, heading };
  }
  const step = 0.5;
  const ahead = mapSimulationPoint(
    x + Math.sin(heading) * step,
    z + Math.cos(heading) * step,
    heading,
  );
  const dx = ahead.x - here.x;
  const dz = ahead.z - here.z;
  return {
    x: here.x,
    z: here.z,
    heading:
      dx * dx + dz * dz < 1e-8 ? heading : Math.atan2(dx, dz),
  };
}

/**
 * Map a pedestrian using the road arm that owns the crosswalk. Pedestrian
 * travel is perpendicular to that arm, so its heading cannot select the
 * simulation projection axis.
 */
export function mapCrosswalkPose(
  x: number,
  z: number,
  heading: number,
  approach: Direction,
): RoadPose {
  const projectionHeading = crosswalkProjectionHeading(approach);
  const here = mapSimulationPoint(x, z, projectionHeading);
  const step = 0.5;
  const ahead = mapSimulationPoint(
    x + Math.sin(heading) * step,
    z + Math.cos(heading) * step,
    projectionHeading,
  );
  const dx = ahead.x - here.x;
  const dz = ahead.z - here.z;
  return {
    x: here.x,
    z: here.z,
    heading:
      dx * dx + dz * dz < 1e-8 ? heading : Math.atan2(dx, dz),
  };
}

export function mapCrosswalkPoint(
  x: number,
  z: number,
  approach: Direction,
): RoadPoint {
  return mapSimulationPoint(x, z, crosswalkProjectionHeading(approach));
}

function crosswalkProjectionHeading(approach: Direction): number {
  return approach === "NORTH" || approach === "SOUTH" ? 0 : Math.PI / 2;
}

/**
 * Corners of a unit square centered on a simulation cell, mapped with the
 * same road frame as vehicles. Order is southwest, southeast, northeast,
 * northwest in simulation space.
 */
export function mapSimulationUnitSquare(
  x: number,
  z: number,
  heading: number,
): readonly [RoadPoint, RoadPoint, RoadPoint, RoadPoint] {
  return [
    mapSimulationPoint(x - 0.5, z - 0.5, heading),
    mapSimulationPoint(x + 0.5, z - 0.5, heading),
    mapSimulationPoint(x + 0.5, z + 0.5, heading),
    mapSimulationPoint(x - 0.5, z + 0.5, heading),
  ];
}

export function mapSimulationPoint(
  x: number,
  z: number,
  heading: number,
): RoadPoint {
  const northSouth = {
    x: laneOffset(x),
    z: longitudinal(z),
  };
  const eastWest = {
    x: longitudinal(x),
    z: laneOffset(z),
  };
  const northSouthWeight = axisWeight(heading);
  return {
    x:
      eastWest.x +
      (northSouth.x - eastWest.x) * northSouthWeight,
    z:
      eastWest.z +
      (northSouth.z - eastWest.z) * northSouthWeight,
  };
}

/** 1 when the vehicle travels north/south, 0 when it travels east/west. */
function axisWeight(heading: number): number {
  const northSouth = Math.abs(Math.cos(heading));
  const eastWest = Math.abs(Math.sin(heading));
  const total = northSouth + eastWest;
  return total === 0 ? 0.5 : northSouth / total;
}

function longitudinal(value: number): number {
  const distance = Math.abs(value);
  if (distance <= SIM_BOX) {
    return (value / SIM_BOX) * STOP_LINE_DISTANCE;
  }
  const sign = Math.sign(value);
  return sign * (STOP_LINE_DISTANCE + (distance - SIM_BOX));
}

function laneOffset(sim: number): number {
  const visuals = [
    -OUTER_LANE,
    -MID_OUTER_LANE,
    -MID_INNER_LANE,
    -INNER_LANE,
    INNER_LANE,
    MID_INNER_LANE,
    MID_OUTER_LANE,
    OUTER_LANE,
  ];
  const first = SIM_LANES[0];
  const last = SIM_LANES[SIM_LANES.length - 1];
  if (first === undefined || last === undefined) {
    return sim;
  }
  if (sim <= first) {
    const slope = (visuals[1] ?? 0) - (visuals[0] ?? 0);
    return (visuals[0] ?? 0) + (sim - first) * slope;
  }
  if (sim >= last) {
    const end = visuals.length - 1;
    const slope = (visuals[end] ?? 0) - (visuals[end - 1] ?? 0);
    return (visuals[end] ?? 0) + (sim - last) * slope;
  }
  for (let index = 0; index < SIM_LANES.length - 1; index += 1) {
    const start = SIM_LANES[index];
    const end = SIM_LANES[index + 1];
    const startVisual = visuals[index];
    const endVisual = visuals[index + 1];
    if (
      start === undefined ||
      end === undefined ||
      startVisual === undefined ||
      endVisual === undefined ||
      sim > end
    ) {
      continue;
    }
    const span = end - start;
    const t = span === 0 ? 0 : (sim - start) / span;
    return startVisual + (endVisual - startVisual) * t;
  }
  return sim;
}

/** How far a painted point sits inside the map edge. Negative means past the edge. */
export function distanceFromMapEdge(
  x: number,
  z: number,
  mapEdge: number = CITY_WORLD_EXTENT,
): number {
  return mapEdge - Math.max(Math.abs(x), Math.abs(z));
}

/** 0 on the map edge, 1 once the vehicle is `EDGE_FADE_SPAN` units inside. */
export function edgeFadeOpacity(distanceFromEdge: number): number {
  const t = clamp(distanceFromEdge / EDGE_FADE_SPAN, 0, 1);
  return t * t * (3 - 2 * t);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
