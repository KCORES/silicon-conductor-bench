import { mixHash } from "./dynamics.js";
import type { Vehicle, VehicleViolation } from "./types.js";
import type { DriverTemperament } from "./vehicleRoster.js";

/** Drivers inside this many ticks of their patience limit appear in driverAlerts. */
export const DRIVER_WARNING_REMAINING_TICKS = 12;
/** Most urgent driver alerts kept in one observation. */
export const DRIVER_ALERT_LIMIT = 8;
/** Upper bound on vehicles that tailgate a single released lane batch. */
export const TAILGATE_FOLLOWER_LIMIT = 2;
/** A cut-in target lane must queue at least this many fewer vehicles. */
export const CUT_IN_MIN_QUEUE_ADVANTAGE = 3;
/** A follower this many empty slots or fewer behind the released vehicle may tailgate. */
export const TAILGATE_MAX_GAP_SLOTS = 2;
/** Rogue entries check this many trajectory slots ahead for moving traffic. */
export const ROGUE_GAP_CHECK_SLOTS = 4;
/** Scheduled vehicles a rogue entry may force to brake before it settles on a collision. */
export const ROGUE_CONFLICT_PASSES = 6;

/** Effectively unlimited patience for drivers that never act out; JSON-safe. */
export const EXEMPT_DRIVER_PATIENCE = 1_000_000;

export const DRIVER_PATIENCE_RANGES: Readonly<
  Record<Exclude<DriverTemperament, "EXEMPT">, readonly [number, number]>
> = {
  AGGRESSIVE: [60, 90],
  NORMAL: [100, 140],
  CALM: [160, 220],
};

export function driverPatienceLimit(
  seed: number,
  vehicleId: string,
  temperament: DriverTemperament,
): number {
  if (temperament === "EXEMPT") {
    return EXEMPT_DRIVER_PATIENCE;
  }
  const [low, high] = DRIVER_PATIENCE_RANGES[temperament];
  return low + (mixHash([seed, vehicleId, "driver-patience"]) % (high - low + 1));
}

/** Red-light runners and tailgaters pay no toll; cut-in drivers still do. */
export function violationForfeitsToll(violation: VehicleViolation | undefined): boolean {
  return violation === "RED_LIGHT" || violation === "TAILGATE";
}

export function driverPatienceRemaining(vehicle: Vehicle): number {
  return vehicle.driverPatienceLimit - vehicle.driverWaitTicks;
}

export function driverPatienceExhausted(vehicle: Vehicle): boolean {
  return driverPatienceRemaining(vehicle) <= 0;
}
