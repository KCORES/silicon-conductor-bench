import { describe, expect, it } from "vitest";
import {
  createRoadFleetLayout,
  createVehicleGalleryLayout,
  placementsOverlap,
  ROAD_FLEET_INNER_DISTANCE,
  ROAD_FLEET_MAX_DISTANCE,
} from "../apps/replay/src/scene/vehicleGalleryLayout.js";
import { VEHICLE_CATALOG } from "../apps/replay/src/scene/vehicleCatalog.generated.js";
import { createRandomVehicleFleet } from "../apps/replay/src/scene/randomVehicleFleet.js";
import { findVehiclePaintConfig } from "../apps/replay/src/scene/vehiclePaintConfig.js";

describe("vehicle gallery layout", () => {
  const items = Array.from({ length: 48 }, (_, index) => ({
    id: `vehicle-${String(index).padStart(2, "0")}`,
    width: 1.1 + (index % 3) * 0.05,
    length: 2 + (index % 5) * 0.55,
  }));

  it("is deterministic and keeps vehicles outside the intersection", () => {
    const placements = createVehicleGalleryLayout(items);
    expect(createVehicleGalleryLayout(items)).toEqual(placements);
    expect(placements).toHaveLength(items.length);
    expect(
      placements.every(
        (placement) =>
          Math.max(Math.abs(placement.x), Math.abs(placement.z)) > 17,
      ),
    ).toBe(true);
  });

  it("places every measured footprint without overlap", () => {
    const placements = createVehicleGalleryLayout(items);
    for (const [index, left] of placements.entries()) {
      for (const right of placements.slice(index + 1)) {
        expect(
          placementsOverlap(left, right),
          `${left.id} should not overlap ${right.id}`,
        ).toBe(false);
      }
    }
  });

  it("packs the complete generated catalog onto the main roads", () => {
    const placements = createVehicleGalleryLayout(
      VEHICLE_CATALOG.map(({ id, width, length }) => ({ id, width, length })),
    );

    expect(placements).toHaveLength(VEHICLE_CATALOG.length);
    for (const [index, left] of placements.entries()) {
      for (const right of placements.slice(index + 1)) {
        expect(
          placementsOverlap(left, right),
          `${left.id} should not overlap ${right.id}`,
        ).toBe(false);
      }
    }
  });

  it("fills the main roads with a deterministic random fleet", () => {
    const first = createRandomVehicleFleet(11);
    const second = createRandomVehicleFleet(11);
    expect(second).toEqual(first);
    expect(createRandomVehicleFleet(12)).not.toEqual(first);
    expect(first.length).toBeGreaterThan(80);

    const uses = { passenger: 0, other: 0 };
    const colorsByLane = new Map<number, string[]>();
    for (const [index, vehicle] of first.entries()) {
      const config = findVehiclePaintConfig(vehicle.specId);
      expect(config?.paintMode).toBe("random");
      if (config?.use === "passenger") {
        uses.passenger += 1;
      } else {
        uses.other += 1;
      }
      const colors = colorsByLane.get(vehicle.laneIndex) ?? [];
      if (colors.length > 0) {
        expect(colors.at(-1)).not.toBe(vehicle.colorId);
      }
      colors.push(vehicle.colorId);
      colorsByLane.set(vehicle.laneIndex, colors);
      const along =
        Math.abs(Math.sin(vehicle.heading)) > 0.5
          ? Math.abs(vehicle.x)
          : Math.abs(vehicle.z);
      expect(along - vehicle.length / 2).toBeGreaterThanOrEqual(
        ROAD_FLEET_INNER_DISTANCE,
      );
      expect(along + vehicle.length / 2).toBeLessThanOrEqual(
        ROAD_FLEET_MAX_DISTANCE,
      );
      for (const other of first.slice(index + 1)) {
        expect(placementsOverlap(vehicle, other)).toBe(false);
      }
    }
    expect(uses.passenger).toBeGreaterThan(uses.other);

    const packed = createRoadFleetLayout(
      first.map((vehicle) => ({
        id: vehicle.id,
        width: vehicle.width,
        length: vehicle.length,
        gap: vehicle.gap,
      })),
    );
    expect(packed).toHaveLength(first.length);
  });
});
