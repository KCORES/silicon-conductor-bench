import type { RouteId, VehicleType } from "./types.js";
import { pickWeightedCatalogVehicle } from "./vehicleRoster.js";

export const ARRIVALS_PER_TICK = 2;

export interface ScheduledArrival {
  readonly tick: number;
  readonly slot: number;
  readonly routeId: RouteId;
  readonly type: VehicleType;
}

export function arrivalsAt(
  seed: number,
  tick: number,
  routeIds: readonly RouteId[],
): readonly ScheduledArrival[] {
  if (!Number.isInteger(seed)) {
    throw new Error(`Simulation seed must be an integer: ${seed}`);
  }
  if (!Number.isInteger(tick) || tick < 0) {
    throw new Error(`Demand tick must be a non-negative integer: ${tick}`);
  }

  const routes = [...routeIds].sort();
  if (routes.length === 0) {
    return [];
  }

  const random = createRandom(hashSeed(seed, tick));
  const arrivals: ScheduledArrival[] = [];
  for (let slot = 0; slot < ARRIVALS_PER_TICK; slot += 1) {
    const routeId = routes[Math.floor(random() * routes.length)];
    if (routeId === undefined) {
      throw new Error("Route list disappeared while sampling demand");
    }
    arrivals.push({
      tick,
      slot,
      routeId,
      type: pickWeightedCatalogVehicle(random),
    });
  }
  return arrivals;
}

function hashSeed(seed: number, tick: number): number {
  let value =
    Math.imul(seed >>> 0, 0x9e3779b1) ^ Math.imul(tick >>> 0, 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}
