import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { VEHICLE_CATALOG } from "../apps/replay/src/scene/vehicleCatalog.generated.js";
import { VEHICLE_PAINT_CONFIG } from "../apps/replay/src/scene/vehiclePaintConfig.js";
import { VEHICLE_PAINT_PALETTES } from "../apps/replay/src/scene/vehiclePaintPalettes.js";
import { createRandomVehicleFleet } from "../apps/replay/src/scene/randomVehicleFleet.js";

describe("vehicle paint configuration", () => {
  it("covers every catalog vehicle exactly once", () => {
    expect(VEHICLE_PAINT_CONFIG).toHaveLength(VEHICLE_CATALOG.length);
    expect(new Set(VEHICLE_PAINT_CONFIG.map((config) => config.id)).size).toBe(
      VEHICLE_CATALOG.length,
    );
    expect(VEHICLE_PAINT_CONFIG.map((config) => config.id).sort()).toEqual(
      VEHICLE_CATALOG.map((spec) => spec.id).sort(),
    );
  });

  it("keeps special liveries fixed and ordinary vehicles random", () => {
    const fixed = VEHICLE_PAINT_CONFIG.filter(
      (config) => config.paintMode === "fixed",
    );
    const random = VEHICLE_PAINT_CONFIG.filter(
      (config) => config.paintMode === "random",
    );
    expect(fixed).toHaveLength(14);
    expect(random).toHaveLength(28);
    expect(
      fixed
        .filter((config) => config.fixedReason === "taxi")
        .map((config) => config.id),
    ).toEqual([
      "city-builder:car_taxi",
      "kenney-cars:taxi",
      "simplepoly-city:Taxi",
      "simplepoly-urban:SPW_Vehicle_Land_Taxi",
    ]);
    expect(
      fixed.find(
        (config) => config.id === "simplepoly-urban:SPW_Vehicle_Land_School Bus",
      )?.fixedReason,
    ).toBe("school-bus");
    expect(
      random
        .filter((config) => config.paletteGroup === "bus")
        .map((config) => config.id),
    ).toEqual([
      "simplepoly-city:Bus",
      "simplepoly-urban:SPW_Vehicle_Land_Bus",
    ]);
    expect(fixed.every((config) => config.fleetWeight === 0)).toBe(true);
    expect(random.every((config) => config.paletteGroup !== null)).toBe(true);
    expect(
      random.every(
        (config) => config.darkCutoff < config.brightCutoff,
      ),
    ).toBe(true);
  });

  it("defines weighted sRGB palettes and records them in the paint document", () => {
    const documentation = readFileSync(
      join(process.cwd(), "docs", "replay-vehicle-paint.md"),
      "utf8",
    );
    for (const config of VEHICLE_PAINT_CONFIG) {
      expect(documentation).toContain(`\`${config.id}\``);
    }
    for (const palette of Object.values(VEHICLE_PAINT_PALETTES)) {
      expect(palette.length).toBeGreaterThan(1);
      for (const swatch of palette) {
        expect(swatch.hex).toMatch(/^#[0-9a-f]{6}$/u);
        expect(swatch.weight).toBeGreaterThan(0);
        expect(documentation).toContain(`\`${swatch.id}\``);
        expect(documentation).toContain(swatch.hex);
      }
    }
  });

  it("chooses the same colors for the same fleet seed", () => {
    const fleet = createRandomVehicleFleet(5);
    expect(createRandomVehicleFleet(5).map((vehicle) => vehicle.hex)).toEqual(
      fleet.map((vehicle) => vehicle.hex),
    );
    expect(new Set(fleet.map((vehicle) => vehicle.hex)).size).toBeGreaterThan(4);
  });
});
