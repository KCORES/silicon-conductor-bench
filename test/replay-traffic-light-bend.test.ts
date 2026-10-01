import { describe, expect, it } from "vitest";
import { bendTrafficLightVertex } from "../apps/replay/src/scene/TrafficLightBend.js";

const bounds = {
  minY: 0,
  maxY: 10,
  centerX: 0,
  centerZ: 0,
};

describe("replay traffic-light bending", () => {
  it("keeps the anchored base unchanged", () => {
    const vertex = { x: 0.2, y: 1, z: 0.1 };
    expect(
      bendTrafficLightVertex(vertex, bounds, { x: 1, z: 0 }, 1),
    ).toEqual(vertex);
  });

  it("curves the top outward and downward", () => {
    const bent = bendTrafficLightVertex(
      { x: 0, y: 10, z: 0 },
      bounds,
      { x: 1, z: 0 },
      1,
    );
    expect(bent.x).toBeGreaterThan(3);
    expect(bent.y).toBeLessThan(10);
    expect(bent.z).toBeCloseTo(0);
  });

  it("restores every vertex exactly at zero bend", () => {
    const vertex = { x: 0.4, y: 9, z: -0.3 };
    expect(
      bendTrafficLightVertex(vertex, bounds, { x: 0, z: -1 }, 0),
    ).toEqual(vertex);
  });

  it("mirrors the bend for opposite directions", () => {
    const vertex = { x: 0, y: 10, z: 0 };
    const positive = bendTrafficLightVertex(
      vertex,
      bounds,
      { x: 0, z: 1 },
      1,
    );
    const negative = bendTrafficLightVertex(
      vertex,
      bounds,
      { x: 0, z: -1 },
      1,
    );
    expect(positive.z).toBeCloseTo(-negative.z);
    expect(positive.y).toBeCloseTo(negative.y);
  });

  it("derives a paused intermediate pose from the original vertex", () => {
    const vertex = { x: 0.3, y: 9, z: -0.2 };
    const first = bendTrafficLightVertex(
      vertex,
      bounds,
      { x: 1, z: 0 },
      0.5,
    );
    const repeated = bendTrafficLightVertex(
      vertex,
      bounds,
      { x: 1, z: 0 },
      0.5,
    );
    expect(repeated).toEqual(first);
    expect(first.x).toBeGreaterThan(vertex.x);
    expect(first.x).toBeLessThan(
      bendTrafficLightVertex(vertex, bounds, { x: 1, z: 0 }, 1).x,
    );
  });
});
