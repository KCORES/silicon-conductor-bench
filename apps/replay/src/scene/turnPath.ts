import * as THREE from "three";
import type {
  ReplayLaneGeometry,
  ReplayPose,
  ReplayScene,
} from "../../../../src/replay/types.js";
import { mapSimulationPose, type RoadPose } from "./roadFrame.js";

const TURN_ROUTE = /^([NESW])_[A-Z0-9_]+_(LEFT|RIGHT)$/;
const SLOT_EPSILON = 1e-4;
const QUARTER_CIRCLE_HANDLE = 0.5522847498;

const INBOUND_HEADING: Record<string, number> = {
  N: 0,
  E: -Math.PI / 2,
  S: Math.PI,
  W: Math.PI / 2,
};

/** Heading after the turn, along the outbound lane the route joins. */
const OUTBOUND_HEADING: Record<string, Record<"LEFT" | "RIGHT", number>> = {
  N: { LEFT: Math.PI / 2, RIGHT: -Math.PI / 2 },
  E: { LEFT: 0, RIGHT: Math.PI },
  S: { LEFT: -Math.PI / 2, RIGHT: Math.PI / 2 },
  W: { LEFT: Math.PI, RIGHT: 0 },
};

export interface TurnPoseSource {
  readonly routeId: string;
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  readonly turnPathProgress?: number;
}

export interface TurnVehiclePose extends RoadPose {
  readonly progress: number;
}

export interface TurnSpacingPose {
  readonly progress: number;
  readonly length: number;
}

/** Returns leader-first head progress values with a cascading body gap applied. */
export function constrainTurnProgresses(
  vehicles: readonly TurnSpacingPose[],
  minimumGap: number,
): readonly number[] {
  const constrained: number[] = [];
  for (let index = 0; index < vehicles.length; index += 1) {
    const vehicle = vehicles[index];
    if (vehicle === undefined) {
      continue;
    }
    const leader = vehicles[index - 1];
    const leaderProgress = constrained[index - 1];
    constrained.push(
      leader === undefined || leaderProgress === undefined
        ? vehicle.progress
        : Math.min(
            vehicle.progress,
            leaderProgress - Math.max(0, leader.length) - minimumGap,
          ),
    );
  }
  return constrained;
}

/**
 * Visual cubic Bézier for one turning route.
 * Samples are arc-length spaced, one per simulation slot.
 */
class TurnRoutePath {
  private constructor(
    readonly samples: readonly RoadPose[],
    private readonly curve: THREE.CubicBezierCurve3,
    private readonly simSlots: readonly ReplayPose[],
    private readonly start: RoadPose,
    private readonly finish: RoadPose,
    private readonly inboundHeading: number,
    private readonly outboundHeading: number,
    readonly length: number,
  ) {}

  static create(trajectory: ReplayLaneGeometry): TurnRoutePath | undefined {
    const parsed = parseTurn(trajectory.id);
    const entry = trajectory.slots[0];
    const exit = trajectory.slots[trajectory.slots.length - 1];
    if (parsed === undefined || entry === undefined || exit === undefined) {
      return undefined;
    }
    if (trajectory.slots.length < 2) {
      return undefined;
    }

    const start = mapSimulationPose(entry.x, entry.z, parsed.inboundHeading);
    const finish = mapSimulationPose(exit.x, exit.z, parsed.outboundHeading);
    const controls = controlPoints(
      start,
      parsed.inboundHeading,
      finish,
      parsed.outboundHeading,
    );
    const curve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(start.x, 0, start.z),
      new THREE.Vector3(controls.p1.x, 0, controls.p1.z),
      new THREE.Vector3(controls.p2.x, 0, controls.p2.z),
      new THREE.Vector3(finish.x, 0, finish.z),
    );
    curve.arcLengthDivisions = 200;
    const divisions = trajectory.slots.length - 1;
    const spaced = curve.getSpacedPoints(divisions);
    const samples = spaced.map((point, index) => {
      const tangent = curve.getTangentAt(index / divisions);
      return {
        x: point.x,
        z: point.z,
        heading: Math.atan2(tangent.x, tangent.z),
      };
    });
    return new TurnRoutePath(
      samples,
      curve,
      trajectory.slots,
      start,
      finish,
      parsed.inboundHeading,
      parsed.outboundHeading,
      curve.getLength(),
    );
  }

  slotIndex(x: number, z: number): number | undefined {
    for (let index = 0; index < this.simSlots.length; index += 1) {
      const slot = this.simSlots[index];
      if (
        slot !== undefined &&
        Math.abs(slot.x - x) <= SLOT_EPSILON &&
        Math.abs(slot.z - z) <= SLOT_EPSILON
      ) {
        return index;
      }
    }
    return undefined;
  }

  ribbonCurve(): THREE.CubicBezierCurve3 {
    return this.curve;
  }

  /** Arc-length parameter `u` in [0, 1]. Integer slots land on `samples`. */
  sample(u: number): RoadPose {
    const divisions = this.samples.length - 1;
    const clamped = Math.min(1, Math.max(0, u));
    const point = this.curve.getPointAt(clamped);
    const tangent = this.curve.getTangentAt(clamped);
    const nearest = Math.round(clamped * divisions);
    const sample = this.samples[nearest];
    if (
      sample !== undefined &&
      Math.abs(clamped * divisions - nearest) < 1e-6
    ) {
      return sample;
    }
    return {
      x: point.x,
      z: point.z,
      heading: Math.atan2(tangent.x, tangent.z),
    };
  }

  /** Samples signed arc length, extending the entry and exit as straight lines. */
  sampleDistance(distance: number): RoadPose {
    if (distance < 0) {
      const inbound = direction(this.inboundHeading);
      return {
        x: this.start.x + inbound.x * distance,
        z: this.start.z + inbound.z * distance,
        heading: this.inboundHeading,
      };
    }
    if (distance > this.length) {
      const outbound = direction(this.outboundHeading);
      const after = distance - this.length;
      return {
        x: this.finish.x + outbound.x * after,
        z: this.finish.z + outbound.z * after,
        heading: this.outboundHeading,
      };
    }
    return this.sample(this.length <= SLOT_EPSILON ? 0 : distance / this.length);
  }

  slotDistance(x: number, z: number): number | undefined {
    const index = this.slotIndex(x, z);
    if (index === undefined) {
      return undefined;
    }
    const divisions = this.samples.length - 1;
    return divisions <= 0 ? 0 : (index / divisions) * this.length;
  }

  sourceDistance(source: TurnPoseSource): number {
    if (Number.isFinite(source.turnPathProgress)) {
      const divisions = Math.max(1, this.simSlots.length - 1);
      return ((source.turnPathProgress ?? 0) / divisions) * this.length;
    }
    const slot = this.slotDistance(source.x, source.z);
    if (slot !== undefined) {
      return slot;
    }

    const mapped = mapSimulationPose(source.x, source.z, source.heading);
    const inbound = direction(this.inboundHeading);
    const outbound = direction(this.outboundHeading);
    const entryDx = mapped.x - this.start.x;
    const entryDz = mapped.z - this.start.z;
    const exitDx = mapped.x - this.finish.x;
    const exitDz = mapped.z - this.finish.z;
    const entryAlong = entryDx * inbound.x + entryDz * inbound.z;
    const exitAlong = exitDx * outbound.x + exitDz * outbound.z;
    const entryLateral = Math.abs(entryDx * inbound.z - entryDz * inbound.x);
    const exitLateral = Math.abs(exitDx * outbound.z - exitDz * outbound.x);
    const projected = this.closestCurveDistance(mapped.x, mapped.z);
    let bestDistance = projected.distance;
    let bestError = projected.error;
    if (entryAlong <= 0 && entryLateral * entryLateral <= bestError) {
      bestDistance = entryAlong;
      bestError = entryLateral * entryLateral;
    }
    if (exitAlong >= 0 && exitLateral * exitLateral <= bestError) {
      bestDistance = this.length + exitAlong;
    }
    return bestDistance;
  }

  private closestCurveDistance(
    x: number,
    z: number,
  ): { distance: number; error: number } {
    const divisions = Math.max(48, this.simSlots.length * 8);
    let closestIndex = 0;
    let closestError = Number.POSITIVE_INFINITY;
    for (let index = 0; index <= divisions; index += 1) {
      const point = this.curve.getPointAt(index / divisions);
      const dx = point.x - x;
      const dz = point.z - z;
      const error = dx * dx + dz * dz;
      if (error < closestError) {
        closestError = error;
        closestIndex = index;
      }
    }
    return {
      distance: (closestIndex / divisions) * this.length,
      error: closestError,
    };
  }

  vehiclePose(headDistance: number, vehicleLength: number): TurnVehiclePose {
    const front = this.sampleDistance(headDistance);
    const rear = this.sampleDistance(headDistance - Math.max(0, vehicleLength));
    const dx = front.x - rear.x;
    const dz = front.z - rear.z;
    return {
      x: (front.x + rear.x) / 2,
      z: (front.z + rear.z) / 2,
      heading:
        dx * dx + dz * dz <= SLOT_EPSILON * SLOT_EPSILON
          ? front.heading
          : Math.atan2(dx, dz),
      progress: headDistance,
    };
  }
}

/** Lane-center curves for turning routes. Straight routes are absent. */
export class TurnPathIndex {
  private constructor(private readonly byRoute: ReadonlyMap<string, TurnRoutePath>) {}

  static empty(): TurnPathIndex {
    return new TurnPathIndex(new Map());
  }

  static fromScene(scene: ReplayScene): TurnPathIndex {
    const byRoute = new Map<string, TurnRoutePath>();
    for (const trajectory of scene.trajectories) {
      const path = TurnRoutePath.create(trajectory);
      if (path !== undefined) {
        byRoute.set(trajectory.id, path);
      }
    }
    return new TurnPathIndex(byRoute);
  }

  samplesFor(routeId: string): readonly RoadPose[] | undefined {
    return this.byRoute.get(routeId)?.samples;
  }

  /** Visual pose when `sim` sits on a turning-route slot. */
  sampleSlot(routeId: string, simX: number, simZ: number): RoadPose | undefined {
    const path = this.byRoute.get(routeId);
    if (path === undefined) {
      return undefined;
    }
    const index = path.slotIndex(simX, simZ);
    if (index === undefined) {
      return undefined;
    }
    return path.sample(index / (path.samples.length - 1));
  }

  sampleVehicle(
    source: TurnPoseSource,
    vehicleLength: number,
  ): TurnVehiclePose | undefined {
    const path = this.byRoute.get(source.routeId);
    if (path === undefined) {
      return undefined;
    }
    return path.vehiclePose(path.sourceDistance(source), vehicleLength);
  }

  vehiclePoseAt(
    routeId: string,
    progress: number,
    vehicleLength: number,
  ): TurnVehiclePose | undefined {
    return this.byRoute.get(routeId)?.vehiclePose(progress, vehicleLength);
  }

  /**
   * Visual pose between two recorded ticks.
   * Both ends on the curve use arc-length `u`. A single end lerps in visual space
   * so the car joins the straight lane without a pop.
   */
  interpolate(
    from: TurnPoseSource,
    to: TurnPoseSource,
    alpha: number,
  ): RoadPose | undefined {
    if (from.routeId !== to.routeId) {
      return undefined;
    }
    const path = this.byRoute.get(from.routeId);
    if (path === undefined) {
      return undefined;
    }
    const fromDistance = path.sourceDistance(from);
    const toDistance = path.sourceDistance(to);
    return path.sampleDistance(
      fromDistance + (toDistance - fromDistance) * alpha,
    );
  }

  interpolateVehicle(
    from: TurnPoseSource,
    to: TurnPoseSource,
    alpha: number,
    vehicleLength: number,
  ): TurnVehiclePose | undefined {
    if (from.routeId !== to.routeId) {
      return undefined;
    }
    const path = this.byRoute.get(from.routeId);
    if (path === undefined) {
      return undefined;
    }
    const fromDistance = path.sourceDistance(from);
    const toDistance = path.sourceDistance(to);
    return path.vehiclePose(
      fromDistance + (toDistance - fromDistance) * alpha,
      vehicleLength,
    );
  }
}

export function turnCurve(
  trajectory: ReplayLaneGeometry,
): THREE.CubicBezierCurve3 | undefined {
  return TurnRoutePath.create(trajectory)?.ribbonCurve();
}

function parseTurn(
  routeId: string,
): { inboundHeading: number; outboundHeading: number } | undefined {
  const match = TURN_ROUTE.exec(routeId);
  if (match === null) {
    return undefined;
  }
  const origin = match[1];
  const maneuver = match[2];
  if (origin === undefined || (maneuver !== "LEFT" && maneuver !== "RIGHT")) {
    return undefined;
  }
  const inboundHeading = INBOUND_HEADING[origin];
  const outboundHeading = OUTBOUND_HEADING[origin]?.[maneuver];
  if (inboundHeading === undefined || outboundHeading === undefined) {
    return undefined;
  }
  return { inboundHeading, outboundHeading };
}

function direction(heading: number): { x: number; z: number } {
  return { x: Math.sin(heading), z: Math.cos(heading) };
}

function controlPoints(
  start: RoadPose,
  inboundHeading: number,
  finish: RoadPose,
  outboundHeading: number,
): { p1: { x: number; z: number }; p2: { x: number; z: number } } {
  const d0 = direction(inboundHeading);
  const d3 = direction(outboundHeading);
  const dx = finish.x - start.x;
  const dz = finish.z - start.z;
  const cross = d0.x * d3.z - d0.z * d3.x;
  let leg0 = Math.hypot(dx, dz) * 0.5;
  let leg3 = leg0;
  if (Math.abs(cross) > 1e-4) {
    const t = (dx * d3.z - dz * d3.x) / cross;
    const cornerX = start.x + t * d0.x;
    const cornerZ = start.z + t * d0.z;
    const s = (finish.x - cornerX) * d3.x + (finish.z - cornerZ) * d3.z;
    if (t > 0.05 && s > 0.05) {
      leg0 = t;
      leg3 = s;
    }
  }
  return {
    p1: {
      x: start.x + d0.x * leg0 * QUARTER_CIRCLE_HANDLE,
      z: start.z + d0.z * leg0 * QUARTER_CIRCLE_HANDLE,
    },
    p2: {
      x: finish.x - d3.x * leg3 * QUARTER_CIRCLE_HANDLE,
      z: finish.z - d3.z * leg3 * QUARTER_CIRCLE_HANDLE,
    },
  };
}
