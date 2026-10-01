import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { BUILDING_CATALOG } from "../apps/replay/src/scene/city/buildingCatalog.generated.js";
import { KIT_TARGET_SHARES } from "../apps/replay/src/scene/city/buildingVariantAssigner.js";
import {
  BUILDING_SETBACK_TILES,
  CITY_INNER_TILE,
  CITY_OUTER_TILE,
  CITY_WORLD_EXTENT,
  DISTRICT_TILE_COUNT,
  MAX_BUILDING_ROWS,
  MIN_ENTRY_MARGIN,
  MIN_ENTRY_SPACING,
  ROAD_SOLVER_MAX_CANDIDATES,
  ROAD_SOLVER_MAX_ITERATIONS,
  TILE_SIZE,
  createCityLayout,
  tileToWorld,
} from "../apps/replay/src/scene/city/cityLayout.js";

describe("constrained replay city layout", () => {
  it("uses a measured six-kit catalog and two-unit grid", () => {
    expect(tileToWorld(4, -7)).toEqual({ x: 8, z: -14 });
    expect(BUILDING_CATALOG).toHaveLength(151);
    expect(new Set(BUILDING_CATALOG.map((spec) => spec.kit))).toEqual(
      new Set([
        "city-builder",
        "suburban",
        "industrial",
        "commercial",
        "simplepoly-city",
        "simplepoly-urban",
      ]),
    );
    expect(
      BUILDING_CATALOG.filter((spec) => spec.kit === "simplepoly-city"),
    ).toHaveLength(26);
    expect(
      BUILDING_CATALOG.filter((spec) => spec.kit === "simplepoly-urban"),
    ).toHaveLength(41);
    for (const spec of BUILDING_CATALOG) {
      expect(spec.width).toBeGreaterThan(0);
      expect(spec.depth).toBeGreaterThan(0);
      expect(spec.height).toBeGreaterThan(0);
      expect(spec.assetPath).toMatch(/^\/assets\//u);
      expect(spec.targetScale).toBeGreaterThan(0);
      expect(
        existsSync(
          join(
            process.cwd(),
            "apps",
            "replay",
            "public",
            spec.assetPath.replace(/^\/+/u, ""),
          ),
        ),
      ).toBe(true);
      expect(spec.modelId).not.toMatch(
        /(?:Demo Scene|Scene_City|SPB_Prop_|Gas Station Prop)/u,
      );
    }
  });

  it("converts every SimplePoly building to a textured GLB", async () => {
    const io = new NodeIO();
    const simplePoly = BUILDING_CATALOG.filter((spec) =>
      spec.kit.startsWith("simplepoly-"),
    );
    expect(simplePoly).toHaveLength(67);
    for (const spec of simplePoly) {
      expect(spec.assetPath).toMatch(/\.glb$/u);
      const document = await io.read(
        join(
          process.cwd(),
          "apps",
          "replay",
          "public",
          spec.assetPath.replace(/^\/+/u, ""),
        ),
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

  it("is deterministic and covers every district grid tile", () => {
    const layout = createCityLayout();
    expect(createCityLayout()).toEqual(layout);
    expect(layout.worldExtent).toBe(CITY_WORLD_EXTENT);
    expect(CITY_WORLD_EXTENT).toBe(
      CITY_OUTER_TILE * TILE_SIZE + TILE_SIZE / 2,
    );
    expect(layout.baseTiles.length + layout.roadTiles.length).toBe(
      DISTRICT_TILE_COUNT * DISTRICT_TILE_COUNT * 4,
    );
    expect(layout.buildingTiles.length).toBeGreaterThan(100);
    expect(layout.civicTiles.length).toBeGreaterThan(0);
    expect(new Set(layout.buildingTiles.map((tile) => tile.kit))).toEqual(
      new Set([
        "city-builder",
        "suburban",
        "industrial",
        "commercial",
        "simplepoly-city",
        "simplepoly-urban",
      ]),
    );
    expect(
      layout.props.some(
        (prop) => prop.kind === "bench" || prop.kind === "bush",
      ),
    ).toBe(false);
    for (const [kit, share] of Object.entries(KIT_TARGET_SHARES)) {
      const count = layout.buildingTiles.filter(
        (building) => building.kit === kit,
      ).length;
      expect(
        Math.abs(count - layout.buildingTiles.length * share),
      ).toBeLessThanOrEqual(8);
    }
    for (const kit of ["simplepoly-city", "simplepoly-urban"] as const) {
      const buildings = layout.buildingTiles.filter(
        (building) => building.kit === kit,
      );
      const usage = new Map<string, number>();
      for (const building of buildings) {
        usage.set(
          building.modelId,
          (usage.get(building.modelId) ?? 0) + 1,
        );
        expect(building.modelId).not.toMatch(/stadium/iu);
      }
      expect(usage.size).toBeGreaterThanOrEqual(9);
      expect(Math.max(...usage.values())).toBeLessThanOrEqual(4);
    }
  });

  it("concentrates high-rises near the intersection and low-rises at the edge", () => {
    const tierValue = { low: 0, mid: 0.5, high: 1 } as const;
    const catalogByModel = new Map(
      BUILDING_CATALOG.map((spec) => [
        `${spec.kit}:${spec.modelId}`,
        spec,
      ]),
    );
    const bands = {
      core: [] as number[],
      middle: [] as number[],
      edge: [] as number[],
    };

    for (const building of createCityLayout().buildingTiles) {
      const spec = catalogByModel.get(
        `${building.kit}:${building.modelId}`,
      );
      expect(spec).toBeDefined();
      if (spec === undefined) {
        continue;
      }
      const normalizedDistance =
        Math.hypot(building.tileX, building.tileZ) /
        (Math.SQRT2 * (CITY_INNER_TILE + DISTRICT_TILE_COUNT - 1));
      const band =
        normalizedDistance < 0.48
          ? bands.core
          : normalizedDistance < 0.72
            ? bands.middle
            : bands.edge;
      band.push(tierValue[spec.heightTier]);
    }

    const average = (values: readonly number[]) =>
      values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(bands.core.length).toBeGreaterThan(0);
    expect(bands.middle.length).toBeGreaterThan(0);
    expect(bands.edge.length).toBeGreaterThan(0);
    expect(average(bands.core)).toBeGreaterThan(average(bands.middle));
    expect(average(bands.middle)).toBeGreaterThan(average(bands.edge));
    expect(bands.core.filter((value) => value === 1).length).toBeGreaterThan(
      bands.edge.filter((value) => value === 1).length,
    );
    expect(bands.core.filter((value) => value === 0)).toHaveLength(0);
    expect(bands.edge.filter((value) => value === 0).length).toBeGreaterThan(
      bands.core.filter((value) => value === 0).length,
    );
  });

  it("bounds every road search and keeps entries in the dynamic range", () => {
    const layout = createCityLayout();
    for (const district of layout.districts) {
      expect(district.candidateCount).toBeLessThanOrEqual(
        ROAD_SOLVER_MAX_CANDIDATES,
      );
      expect(district.iterationCount).toBeLessThanOrEqual(
        ROAD_SOLVER_MAX_ITERATIONS,
      );
      expect(district.maxGapTiles).toBeLessThanOrEqual(1);
      expect(district.maxBuildingRows).toBeLessThanOrEqual(
        MAX_BUILDING_ROWS,
      );
      for (const edge of ["x", "z"] as const) {
        const indices = district.entries
          .filter((entry) => entry.edge === edge)
          .map((entry) => (edge === "x" ? entry.localZ : entry.localX))
          .sort((left, right) => left - right);
        for (const [index, value] of indices.entries()) {
          expect(value).toBeGreaterThanOrEqual(MIN_ENTRY_MARGIN);
          expect(value).toBeLessThanOrEqual(
            DISTRICT_TILE_COUNT - MIN_ENTRY_MARGIN,
          );
          const previous = indices[index - 1];
          if (previous !== undefined) {
            expect(value - previous).toBeGreaterThanOrEqual(
              MIN_ENTRY_SPACING,
            );
          }
        }
      }
    }
  });

  it("places non-overlapping real lots and prioritizes main frontage", () => {
    const layout = createCityLayout();
    const occupied = new Set<string>();
    let largeVolumes = 0;
    let mainFrontage = 0;
    for (const building of layout.buildingTiles) {
      const halfWidth = (building.lotWidthTiles - 1) / 2;
      const halfDepth = (building.lotDepthTiles - 1) / 2;
      const minX = building.tileX - halfWidth;
      const minZ = building.tileZ - halfDepth;
      const maxX = building.tileX + halfWidth;
      const maxZ = building.tileZ + halfDepth;
      for (let x = 0; x < building.lotWidthTiles; x += 1) {
        for (let z = 0; z < building.lotDepthTiles; z += 1) {
          const key = `${minX + x}:${minZ + z}`;
          expect(occupied.has(key)).toBe(false);
          occupied.add(key);
        }
      }
      if (
        building.lotWidthTiles > 2 ||
        building.lotDepthTiles > 2
      ) {
        largeVolumes += 1;
      }
      if (building.frontage === "main") {
        mainFrontage += 1;
        expect(
          Math.abs(minX) === CITY_INNER_TILE + BUILDING_SETBACK_TILES ||
            Math.abs(maxX) === CITY_INNER_TILE + BUILDING_SETBACK_TILES ||
            Math.abs(minZ) === CITY_INNER_TILE + BUILDING_SETBACK_TILES ||
            Math.abs(maxZ) === CITY_INNER_TILE + BUILDING_SETBACK_TILES,
        ).toBe(true);
      }
    }
    expect(largeVolumes).toBeGreaterThan(0);
    expect(mainFrontage).toBeGreaterThan(0);
  });
});
