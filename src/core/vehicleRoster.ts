import type { VehicleType } from "./types.js";
import {
  SIMULATION_SLOT_LENGTH,
  VEHICLE_ROSTER,
  type CatalogVehicleClass,
  type CatalogVehicleId,
} from "./vehicleRoster.generated.js";

export { SIMULATION_SLOT_LENGTH, VEHICLE_ROSTER };
export type { CatalogVehicleClass, CatalogVehicleId };

const LENGTH_EPSILON = 1e-4;

const ROSTER_BY_ID = new Map(
  VEHICLE_ROSTER.map((vehicle) => [vehicle.id, vehicle]),
);

export const LEGACY_SEDAN_CATALOG_ID =
  "kenney-cars:sedan" satisfies CatalogVehicleId;
export const MOTORCYCLE_LENGTH_SLOTS = 1;

export const SPAWN_CLASS_WEIGHT = {
  passenger: 8,
  van: 11,
  truck: 3,
  bus: 6,
  emergency: 2,
} as const satisfies Record<CatalogVehicleClass, number>;

export type DriverTemperament = "AGGRESSIVE" | "NORMAL" | "CALM" | "EXEMPT";
export type VehicleRiskTag = "SCHOOL_BUS" | "HAZMAT";

export const BUS_PASSENGERS = 40;
export const SHUTTLE_PASSENGERS = 8;
export const TAXI_PASSENGERS = 2;
export const HEAVY_TRUCK_UNITS = 3;

const AGGRESSIVE_ID_PATTERN = /taxi|sports|muscle/i;
const SCHOOL_BUS_ID_PATTERN = /school bus/i;
const HAZMAT_ID_PATTERN = /tanker/i;

/** Billing units per vehicle: passengers for people movers, cargo units for heavy trucks. */
export function passengersFor(type: VehicleType): number {
  if (type === "MOTORCYCLE" || type === "SEDAN") {
    return 1;
  }
  const vehicleKind = vehicleClass(type);
  if (vehicleKind === "bus") {
    return BUS_PASSENGERS;
  }
  if (vehicleKind === "van") {
    return SHUTTLE_PASSENGERS;
  }
  if (vehicleKind === "truck") {
    return resolveVehicleOccupancy(type).lengthSlots >= 4 ? HEAVY_TRUCK_UNITS : 1;
  }
  if (vehicleKind === "passenger" && /taxi/i.test(type)) {
    return TAXI_PASSENGERS;
  }
  return 1;
}

export function temperamentFor(type: VehicleType): DriverTemperament {
  if (type === "MOTORCYCLE" || type === "SEDAN") {
    return "NORMAL";
  }
  const vehicleKind = vehicleClass(type);
  if (vehicleKind === "emergency") {
    return "EXEMPT";
  }
  if (vehicleKind === "bus" || /garbage/i.test(type)) {
    return "CALM";
  }
  if (vehicleKind === "truck") {
    return resolveVehicleOccupancy(type).lengthSlots >= 4 ? "CALM" : "NORMAL";
  }
  return AGGRESSIVE_ID_PATTERN.test(type) ? "AGGRESSIVE" : "NORMAL";
}

export function riskTagFor(type: VehicleType): VehicleRiskTag | undefined {
  if (SCHOOL_BUS_ID_PATTERN.test(type)) {
    return "SCHOOL_BUS";
  }
  return HAZMAT_ID_PATTERN.test(type) ? "HAZMAT" : undefined;
}

export function lengthSlotsForWorldLength(length: number): number {
  if (!Number.isFinite(length) || length <= 0) {
    throw new Error(`Vehicle length must be positive: ${length}`);
  }
  return Math.max(
    1,
    Math.ceil((length - LENGTH_EPSILON) / SIMULATION_SLOT_LENGTH),
  );
}

export function resolveVehicleOccupancy(type: VehicleType): {
  readonly type: VehicleType;
  readonly lengthSlots: number;
} {
  if (type === "MOTORCYCLE") {
    return { type, lengthSlots: MOTORCYCLE_LENGTH_SLOTS };
  }
  const catalogId = type === "SEDAN" ? LEGACY_SEDAN_CATALOG_ID : type;
  const spec = ROSTER_BY_ID.get(catalogId);
  if (spec === undefined) {
    throw new Error(`Unknown vehicle type: ${type}`);
  }
  return { type, lengthSlots: spec.lengthSlots };
}

export function pickWeightedCatalogVehicle(
  random: () => number,
): CatalogVehicleId {
  const total = VEHICLE_ROSTER.reduce(
    (sum, vehicle) => sum + SPAWN_CLASS_WEIGHT[vehicle.vehicleClass],
    0,
  );
  let roll = random() * total;
  for (const vehicle of VEHICLE_ROSTER) {
    roll -= SPAWN_CLASS_WEIGHT[vehicle.vehicleClass];
    if (roll < 0) {
      return vehicle.id;
    }
  }
  const last = VEHICLE_ROSTER[VEHICLE_ROSTER.length - 1];
  if (last === undefined) {
    throw new Error("Vehicle roster is empty");
  }
  return last.id;
}

export function rewardTollForVehicle(
  type: VehicleType,
  tollMotorcycle: number,
  tollStandard: number,
  tollEmergency: number,
): number {
  if (type === "MOTORCYCLE") {
    return tollMotorcycle;
  }
  return vehicleClass(type) === "emergency"
    ? tollEmergency
    : tollStandard * passengersFor(type);
}

export function vehicleClass(type: VehicleType): CatalogVehicleClass {
  if (type === "MOTORCYCLE" || type === "SEDAN") {
    return "passenger";
  }
  return ROSTER_BY_ID.get(type)?.vehicleClass ?? "passenger";
}

export function vehicleDimensions(type: VehicleType): {
  readonly width: number;
  readonly length: number;
} {
  if (type === "MOTORCYCLE") {
    return { width: 0.46, length: 1 };
  }
  const catalogId = type === "SEDAN" ? LEGACY_SEDAN_CATALOG_ID : type;
  const spec = ROSTER_BY_ID.get(catalogId);
  return {
    width: spec?.width ?? 1.13,
    length: spec?.length ?? 2.4,
  };
}
