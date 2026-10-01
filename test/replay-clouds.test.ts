import { describe, expect, it } from "vitest";
import { infinitownCloudGeometries } from "../apps/replay/src/scene/infinitownCloudGeometry.generated.js";
import {
  CLOUD_DIRECTION_X,
  CLOUD_DIRECTION_Z,
  CLOUD_RANDOM_SEED,
  CLOUD_REFERENCE_FRAME_RATE,
  CLOUD_BASE_FRAME_SPEED,
  cloudScale,
  createCloudSpawns,
  mulberry32,
  stepCloud,
  wrapCloudAxis,
} from "../apps/replay/src/scene/cloudMotion.js";

describe("infinitown cloud motion", () => {
  it("breathes within five percent of the base scale", () => {
    for (let step = 0; step < 20; step += 1) {
      const scale = cloudScale(1.5, step * 0.2);
      expect(scale).toBeGreaterThanOrEqual(0.95);
      expect(scale).toBeLessThanOrEqual(1.05);
    }
    expect(cloudScale(0, Math.PI / 4)).toBeCloseTo(1.05, 5);
    expect(cloudScale(0, (3 * Math.PI) / 4)).toBeCloseTo(0.95, 5);
  });

  it("drifts along the Infinitown direction at the 60 Hz frame speed", () => {
    const speedModifier = 1.2;
    const next = stepCloud({
      x: 0,
      z: 0,
      delay: 0,
      speedModifier,
      elapsed: 0,
      deltaSeconds: 1,
      halfSpan: 150,
    });
    const distance = CLOUD_BASE_FRAME_SPEED * speedModifier * CLOUD_REFERENCE_FRAME_RATE;
    expect(next.x).toBeCloseTo(CLOUD_DIRECTION_X * distance, 5);
    expect(next.z).toBeCloseTo(CLOUD_DIRECTION_Z * distance, 5);
  });

  it("wraps a cloud that leaves the field back onto the opposite side", () => {
    expect(wrapCloudAxis(160, 150)).toBeCloseTo(-140, 5);
    expect(wrapCloudAxis(-160, 150)).toBeCloseTo(140, 5);
    const next = stepCloud({
      x: -149,
      z: 0,
      delay: 0,
      speedModifier: 1,
      elapsed: 0,
      deltaSeconds: 1,
      halfSpan: 150,
    });
    expect(next.x).toBeGreaterThan(-150);
    expect(next.x).toBeLessThan(150);
    expect(next.x).toBeGreaterThan(0);
  });

  it("scatters several clouds across a city-sized field", () => {
    const layout = createCloudSpawns(69, mulberry32(CLOUD_RANDOM_SEED), 5);
    expect(layout.chunkCount).toBe(3);
    expect(layout.halfSpan).toBe(90);
    expect(layout.spawns.length).toBeGreaterThanOrEqual(2);
    expect(layout.spawns.length).toBeLessThanOrEqual(9);
    for (const spawn of layout.spawns) {
      expect(spawn.prefabIndex).toBeGreaterThanOrEqual(0);
      expect(spawn.prefabIndex).toBeLessThan(5);
      expect(Math.abs(spawn.x)).toBeLessThanOrEqual(layout.halfSpan);
      expect(Math.abs(spawn.z)).toBeLessThanOrEqual(layout.halfSpan);
      expect(spawn.speedModifier).toBeGreaterThanOrEqual(1);
      expect(spawn.speedModifier).toBeLessThanOrEqual(1.25);
    }
  });
});

describe("infinitown cloud meshes", () => {
  it("decodes the two cumulus geometries", () => {
    const geometries = infinitownCloudGeometries();
    expect(geometries).toHaveLength(2);
    expect(geometries[0]?.getAttribute("position").count).toBe(981);
    expect(geometries[0]?.getIndex()?.count).toBe(1062);
    expect(geometries[1]?.getAttribute("position").count).toBe(941);
    expect(geometries[1]?.getIndex()?.count).toBe(996);
    geometries[0]?.computeBoundingBox();
    const box = geometries[0]?.boundingBox;
    expect(box).not.toBeNull();
    expect(box?.max.x ?? 0).toBeGreaterThan(10);
    expect(box?.min.y ?? 0).toBeLessThan(0);
  });
});
