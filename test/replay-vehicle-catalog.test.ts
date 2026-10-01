import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";
import { VEHICLE_CATALOG } from "../apps/replay/src/scene/vehicleCatalog.generated.js";
import {
  replayVehicleSpec,
  vehicleTemplateKey,
} from "../apps/replay/src/scene/vehicleModelSpec.js";

const publicRoot = join(process.cwd(), "apps", "replay", "public");
const documentationPath = join(
  process.cwd(),
  "docs",
  "replay-vehicle-assets.md",
);
const laneWidth = 1.425;
const targetRatios = {
  passenger: 0.79,
  van: 0.8,
  truck: 0.85,
  bus: 0.85,
  emergency: 0.84,
} as const;
const lengthCaps = {
  passenger: 2.8,
  van: 3.2,
  truck: 4.35,
  bus: 3.9,
  emergency: 3.4,
} as const;

describe("replay vehicle catalog", () => {
  it("resolves legacy replay types to shared catalog assets", () => {
    const sedan = replayVehicleSpec("SEDAN");
    expect(sedan?.id).toBe("kenney-cars:sedan");
    expect(sedan === undefined ? "" : vehicleTemplateKey(sedan)).toBe(
      "vehicle-gallery:kenney-cars:sedan",
    );
    expect(replayVehicleSpec("MOTORCYCLE")).toBeUndefined();
  });

  it("contains the selected standalone road vehicles", () => {
    expect(VEHICLE_CATALOG).toHaveLength(42);
    expect(countBy("kit")).toEqual({
      "city-builder": 5,
      "kenney-cars": 15,
      "simplepoly-city": 9,
      "simplepoly-urban": 13,
    });
    expect(countBy("vehicleClass")).toEqual({
      bus: 3,
      emergency: 9,
      passenger: 16,
      truck: 13,
      van: 1,
    });
    expect(new Set(VEHICLE_CATALOG.map((spec) => spec.id)).size).toBe(
      VEHICLE_CATALOG.length,
    );
    for (const spec of VEHICLE_CATALOG) {
      expect(spec.modelId).not.toMatch(
        /(?:kart|race|tractor|debris|wheel|static wheels)/iu,
      );
      expect(spec.width).toBeCloseTo(
        laneWidth * targetRatios[spec.vehicleClass],
        5,
      );
      expect(spec.length).toBeGreaterThan(spec.width);
      expect(spec.height).toBeGreaterThan(0);
      expect(spec.targetScale).toBeGreaterThan(0);
      expect(spec.groundOffset).toBeGreaterThanOrEqual(0);
      expect(spec.length).toBeLessThanOrEqual(
        lengthCaps[spec.vehicleClass] + 0.000001,
      );
      expect(spec.sourcePath).not.toHaveLength(0);
      expect(spec.textureDependency).not.toHaveLength(0);
      expect([0, 1]).toContain(spec.modelQuarterTurns);
    }
  });

  it("copies every catalog asset and required sidecar", () => {
    for (const spec of VEHICLE_CATALOG) {
      const assetPath = join(publicRoot, spec.assetPath.replace(/^\/+/u, ""));
      expect(existsSync(assetPath), spec.assetPath).toBe(true);
      if (spec.assetPath.endsWith(".gltf")) {
        const gltf = JSON.parse(readFileSync(assetPath, "utf8")) as {
          buffers?: readonly { readonly uri?: string }[];
          images?: readonly { readonly uri?: string }[];
        };
        for (const dependency of [
          ...(gltf.buffers ?? []),
          ...(gltf.images ?? []),
        ]) {
          if (dependency.uri !== undefined) {
            expect(
              existsSync(join(dirname(assetPath), dependency.uri)),
              dependency.uri,
            ).toBe(true);
          }
        }
      }
    }
  });

  it("embeds exactly one default texture in every SimplePoly GLB", async () => {
    const io = new NodeIO();
    const simplePoly = VEHICLE_CATALOG.filter((spec) =>
      spec.kit.startsWith("simplepoly-"),
    );
    expect(simplePoly).toHaveLength(22);
    for (const spec of simplePoly) {
      const document = await io.read(
        join(publicRoot, spec.assetPath.replace(/^\/+/u, "")),
      );
      expect(document.getRoot().listMeshes().length).toBeGreaterThan(0);
      expect(document.getRoot().listTextures()).toHaveLength(1);
      expect(
        document
          .getRoot()
          .listMaterials()
          .every((material) => material.getBaseColorTexture() !== null),
      ).toBe(true);
    }
  });

  it("keeps generated documentation consistent with the catalog", () => {
    const documentation = readFileSync(documentationPath, "utf8");
    expect(documentation).toContain(
      `Total: **${VEHICLE_CATALOG.length} vehicles**`,
    );
    for (const spec of VEHICLE_CATALOG) {
      expect(documentation).toContain(`\`${spec.id}\``);
      expect(documentation).toContain(`\`${spec.assetPath}\``);
    }
  });
});

function countBy(key: "kit" | "vehicleClass"): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const spec of VEHICLE_CATALOG) {
    const value = spec[key];
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}
