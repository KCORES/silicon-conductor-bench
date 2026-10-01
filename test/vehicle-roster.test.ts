import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SimulationEngine } from "../src/core/engine.js";
import { createRoadNetwork } from "../src/core/network.js";
import {
  LEGACY_SEDAN_CATALOG_ID,
  VEHICLE_ROSTER,
  lengthSlotsForWorldLength,
  resolveVehicleOccupancy,
  rewardTollForVehicle,
} from "../src/core/vehicleRoster.js";
import {
  createReplayScene,
  resolveVehiclePose,
} from "../src/replay/geometry.js";

interface CatalogEntry {
  readonly id: string;
  readonly vehicleClass: string;
  readonly length: number;
}

function catalogFromSource(): CatalogEntry[] {
  const source = readFileSync(
    "apps/replay/src/scene/vehicleCatalog.generated.ts",
    "utf8",
  );
  const start = source.indexOf("[");
  const end = source.indexOf("] as const");
  return JSON.parse(source.slice(start, end + 1)) as CatalogEntry[];
}

describe("vehicle roster occupancy", () => {
  it("keeps the benchmark roster aligned with the replay catalog", () => {
    const catalog = catalogFromSource();
    expect(VEHICLE_ROSTER).toHaveLength(42);
    expect(VEHICLE_ROSTER.map((vehicle) => vehicle.id)).toEqual(
      catalog.map((vehicle) => vehicle.id),
    );
    for (const [index, vehicle] of VEHICLE_ROSTER.entries()) {
      const source = catalog[index];
      expect(vehicle.length).toBe(source?.length);
      expect(vehicle.vehicleClass).toBe(source?.vehicleClass);
      expect(vehicle.lengthSlots).toBe(
        lengthSlotsForWorldLength(vehicle.length),
      );
    }
  });

  it("maps the legacy sedan to two slots and motorcycles to one", () => {
    expect(resolveVehicleOccupancy("SEDAN")).toEqual({
      type: "SEDAN",
      lengthSlots: 2,
    });
    expect(
      resolveVehicleOccupancy(LEGACY_SEDAN_CATALOG_ID).lengthSlots,
    ).toBe(2);
    expect(resolveVehicleOccupancy("MOTORCYCLE")).toEqual({
      type: "MOTORCYCLE",
      lengthSlots: 1,
    });
    expect(rewardTollForVehicle("MOTORCYCLE", 20, 50, 100)).toBe(20);
    expect(
      rewardTollForVehicle("city-builder:car_hatchback", 20, 50, 100),
    ).toBe(50);
    expect(rewardTollForVehicle("SEDAN", 20, 50, 100)).toBe(50);
    expect(
      rewardTollForVehicle("city-builder:car_police", 20, 50, 100),
    ).toBe(100);
  });

  it("occupies a long truck's full footprint and waits for its tail to exit", () => {
    const truck = VEHICLE_ROSTER.find(
      (vehicle) =>
        vehicle.id === "simplepoly-urban:SPW_Vehicle_Land_Truck Container",
    );
    expect(truck?.lengthSlots).toBe(5);
    if (truck === undefined) {
      return;
    }

    const network = createRoadNetwork({ outboundLaneLength: 15 });
    const engine = new SimulationEngine({ network });
    const vehicle = engine.spawnVehicle("N_S1_STRAIGHT", truck.id);
    expect(vehicle?.type).toBe(truck.id);
    expect(vehicle?.lengthSlots).toBe(5);
    expect(vehicle?.inboundHeadSlot).toBe(4);
    expect(engine.spawnVehicle("N_S1_STRAIGHT", truck.id)).toBeUndefined();
    if (vehicle === undefined) {
      return;
    }

    expect(
      resolveVehiclePose(vehicle, createReplayScene(network)).segments,
    ).toHaveLength(5);

    for (let tick = 0; tick < 40 && vehicle.state !== "AT_STOPLINE"; tick += 1) {
      engine.step();
    }
    expect(vehicle.state).toBe("AT_STOPLINE");
    engine.applyAdmissions([vehicle.id]);

    let guard = 0;
    while (vehicle.state !== "OUTBOUND" && guard < 200) {
      engine.step();
      guard += 1;
    }
    expect(vehicle.state).toBe("OUTBOUND");
    while (
      vehicle.outboundHeadSlot < 15 + vehicle.lengthSlots - 2 &&
      guard < 400
    ) {
      engine.step();
      guard += 1;
    }
    expect(engine.vehicles.has(vehicle.id)).toBe(true);
    engine.step();
    expect(engine.vehicles.has(vehicle.id)).toBe(false);
  });

  it("draws random demand only from catalog vehicles", () => {
    const engine = new SimulationEngine({
      network: createRoadNetwork(),
      seed: 11,
    });
    const seen = new Set<string>();
    for (let attempt = 0; attempt < 48; attempt += 1) {
      const vehicle = engine.spawnRandomVehicle();
      if (vehicle === undefined) {
        continue;
      }
      seen.add(vehicle.type);
      const spec = VEHICLE_ROSTER.find((entry) => entry.id === vehicle.type);
      expect(spec?.lengthSlots).toBe(vehicle.lengthSlots);
    }
    expect(seen.size).toBeGreaterThan(1);
    expect(seen.has("MOTORCYCLE")).toBe(false);
    expect(seen.has("SEDAN")).toBe(false);
  });
});
