import type { Maneuver, RoadNetwork, RouteId, Trajectory } from "./types.js";

export interface EngineDynamics {
  readonly startupLagTicks: number;
  readonly slowStartSteps: number;
  readonly creepAfterWaitingTicks: number;
  readonly waitingChargeGraceTicks: number;
  readonly exitHoldPeriod: number;
  readonly exitHoldDuration: number;
  readonly exitHoldModulus: number;
  readonly exitHoldPreview: number;
  readonly crosswalkPeriod: number;
  readonly crosswalkDuration: number;
  readonly crosswalkModulus: number;
  readonly crosswalkPreview: number;
  readonly stallModulus: number;
  readonly stallChainAfterTicks: number;
  readonly stallChainStep: number;
  readonly emergencyDelayBleedPerTick: number;
  readonly laneGuidanceNearSlots: number;
  readonly laneGuidanceFarSlots: number;
  readonly scheduleSlideLimitTicks: number;
  /** Lets impatient drivers run red lights, tailgate, and cut in. */
  readonly vehicleAggression: boolean;
  /** Hazard bleed multiplier for incidents that involve a hazmat tanker. */
  readonly hazmatHazardMultiplier: number;
}

/** Inbound emergencies inside this distance appear in priority alerts. */
export const EMERGENCY_ALERT_HORIZON_SLOTS = 12;

export const DEFAULT_DYNAMICS: EngineDynamics = {
  startupLagTicks: 1,
  slowStartSteps: 2,
  creepAfterWaitingTicks: 8,
  waitingChargeGraceTicks: 10,
  exitHoldPeriod: 30,
  exitHoldDuration: 12,
  exitHoldModulus: 5,
  exitHoldPreview: 10,
  crosswalkPeriod: 30,
  crosswalkDuration: 8,
  crosswalkModulus: 4,
  crosswalkPreview: 10,
  stallModulus: 17,
  stallChainAfterTicks: 20,
  stallChainStep: 0.02,
  emergencyDelayBleedPerTick: 0.15,
  laneGuidanceNearSlots: 12,
  laneGuidanceFarSlots: 24,
  scheduleSlideLimitTicks: 20,
  vehicleAggression: false,
  hazmatHazardMultiplier: 3,
};

export interface TimedHold {
  readonly id: string;
  readonly startTick: number;
  readonly blockedUntilTick: number;
}

export function mixHash(parts: readonly (string | number)[]): number {
  let value = 0x811c9dc5;
  for (const part of parts) {
    const text = String(part);
    for (let index = 0; index < text.length; index += 1) {
      value = Math.imul(value ^ text.charCodeAt(index), 0x01000193);
    }
    value = Math.imul(value ^ 0x9e3779b1, 0x85ebca6b);
  }
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  return (value ^ (value >>> 16)) >>> 0;
}

export function willStall(
  seed: number,
  routeId: string,
  generatedAtTick: number,
  modulus: number,
): boolean {
  if (modulus <= 1) {
    return true;
  }
  return mixHash([seed, routeId, generatedAtTick, "stall"]) % modulus === 0;
}

export function visibleHolds(
  seed: number,
  ids: readonly string[],
  tick: number,
  period: number,
  duration: number,
  modulus: number,
  preview: number,
  salt: string,
): TimedHold[] {
  if (period <= 0 || duration <= 0 || modulus <= 0) {
    return [];
  }
  const holds: TimedHold[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const firstWindow = Math.floor(tick / period);
    const lastWindow = Math.floor((tick + preview) / period);
    for (let windowIndex = firstWindow; windowIndex <= lastWindow; windowIndex += 1) {
      if (mixHash([seed, id, windowIndex, salt]) % modulus !== 0) {
        continue;
      }
      const startTick = windowIndex * period;
      const blockedUntilTick = startTick + duration;
      if (blockedUntilTick <= tick || startTick > tick + preview) {
        continue;
      }
      const key = `${id}:${startTick}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      holds.push({ id, startTick, blockedUntilTick });
    }
  }
  return holds.sort(
    (left, right) =>
      left.startTick - right.startTick || left.id.localeCompare(right.id),
  );
}

export function holdBlocksTick(holds: readonly TimedHold[], id: string, tick: number): boolean {
  return holds.some(
    (hold) =>
      hold.id === id && tick >= hold.startTick && tick < hold.blockedUntilTick,
  );
}

export function adjacentRouteIds(
  network: RoadNetwork,
  routeId: RouteId,
): RouteId[] {
  const requestedSource = network.trajectories.get(routeId);
  const source =
    requestedSource?.guidanceForRouteId === undefined
      ? requestedSource
      : network.trajectories.get(requestedSource.guidanceForRouteId);
  if (source === undefined) {
    return [];
  }
  const siblings = [...network.trajectories.values()]
    .filter(
      (trajectory) =>
        trajectory.origin === source.origin &&
        trajectory.guidanceForRouteId === undefined &&
        network.inboundLanes.get(trajectory.inboundLaneId)?.routeId ===
          trajectory.id,
    )
    .sort((left, right) => lateralKey(left) - lateralKey(right) || left.id.localeCompare(right.id));
  const index = siblings.findIndex((trajectory) => trajectory.id === source.id);
  if (index < 0) {
    return [];
  }
  return [siblings[index - 1], siblings[index + 1]]
    .filter((trajectory): trajectory is Trajectory => trajectory !== undefined)
    .map((trajectory) => trajectory.id);
}

export function isTurningManeuver(maneuver: Maneuver): boolean {
  return maneuver === "LEFT" || maneuver === "RIGHT";
}

function lateralKey(trajectory: Trajectory): number {
  const entry = trajectory.slots[0];
  if (entry === undefined) {
    return 0;
  }
  return trajectory.origin === "NORTH" || trajectory.origin === "SOUTH"
    ? entry.x
    : entry.y;
}
